# Seguridad de infraestructura — VPS

Auditoría del 9 de agosto de 2026 sobre `srv1676707` (177.7.40.130) y procedimientos de corrección.

---

## Estado encontrado

### Correcto (no tocar)

- `fail2ban` activo
- Sin actualizaciones de seguridad pendientes
- `JWT_SECRET` de 64 caracteres
- `back/.env` ignorado por git
- TLS gestionado por Certbot en `dashboard.fersuastudio.com`
- `wandy-postgres` publicado como `127.0.0.1:5434->5432` — la forma correcta

### A corregir

| Sev | Hallazgo | Estado |
|-----|----------|--------|
| Crítico | MySQL publicado en `0.0.0.0:3307` con `root`/`root`; credenciales en el repo | Ver §1 y §2 |
| Alto | Volumen de datos anónimo: `docker compose down && up` deja la base vacía | Ver §2 |
| Alto | `PermitRootLogin yes` + autenticación por contraseña activa | Ver §3 |
| Medio | `IMPORT_WIPE_SECRET` de 17 caracteres protege el borrado masivo | Ver §4 |

---

## §1 — Cortar la exposición de MySQL (inmediato, sin riesgo)

`ufw` está activo y **no** permite el 3307, pero Docker escribe sus reglas de iptables
por debajo de ufw y las evita. Por eso el puerto quedó abierto a internet pese al firewall.

La cadena `DOCKER-USER` sí se evalúa antes que las reglas de Docker:

```bash
sudo iptables -I DOCKER-USER -i eth0 -p tcp --dport 3306 -j DROP
```

`-i eth0` limita el bloqueo al tráfico que entra por la interfaz externa, así que la
comunicación entre contenedores no se ve afectada.

Persistir entre reinicios:

```bash
sudo apt install -y iptables-persistent && sudo netfilter-persistent save
```

Verificar desde una máquina externa (debe fallar la conexión):

```bash
nc -zv -w 5 177.7.40.130 3307
```

---

## §2 — Volumen con nombre y puerto en loopback

Corrige la causa de fondo del riesgo de pérdida de datos.

**Se hace sin tocar las credenciales.** Cambiar volumen y credenciales a la vez multiplica
las formas de fallar; con el puerto ya cerrado (§1), rotar `root/root` dejó de ser urgente
y se hace aparte en §4.

Hay tiempo fuera de servicio mientras se restaura el respaldo.

### Red de seguridad

El volumen anónimo **no se borra** en este procedimiento. Si algo sale mal, se puede
volver al estado anterior apuntando el contenedor de nuevo a ese volumen. No lo elimines
hasta tener varios días de funcionamiento correcto.

### 2.1 Baseline: respaldo y conteos exactos

```bash
mkdir -p ~/backups && docker exec dashboard-dropshipping-mysql-1 sh -c 'exec mysqldump -uroot -proot --single-transaction --routines --triggers fersua_dashboard' > ~/backups/pre_volumen_$(date +%Y%m%d_%H%M%S).sql
```

El dump debe cerrar con `Dump completed`. Anotar los conteos de las tablas grandes
(`pedidos`, `productos_detalle`, `cartera_movimientos`, `advertising_campaign_metrics`,
`cpa_experimental`): son la prueba de que la restauración quedó completa.

`information_schema.table_rows` da estimaciones en InnoDB — usar `COUNT(*)`.

### 2.2 Detener la escritura

```bash
pm2 stop fersua-api
```

### 2.3 Recrear el contenedor

Con el `docker-compose.yml` actualizado, MySQL arranca sobre `fersua_mysql_data`, vacío:

```bash
cd ~/apps/Dashboard-dropshipping && docker compose up -d --force-recreate
```

Esperar a que acepte conexiones antes de restaurar:

```bash
docker exec dashboard-dropshipping-mysql-1 mysqladmin -uroot -proot ping
```

### 2.4 Restaurar

```bash
docker exec -i dashboard-dropshipping-mysql-1 mysql -uroot -proot fersua_dashboard < ~/backups/pre_volumen_*.sql
```

### 2.5 Verificar antes de reactivar

Comparar los conteos con los de §2.1. **Deben coincidir exactamente.** Si falta una sola
fila, no reactivar: revisar el error de la restauración.

Solo si coinciden:

```bash
pm2 start fersua-api && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/api/health
```

Y confirmar que el puerto sigue cerrado desde fuera y que la app conecta:

```bash
cd ~/apps/Dashboard-dropshipping/back && npx prisma migrate status
```

---

## §3 — Endurecer SSH

`PermitRootLogin yes` en `/etc/ssh/sshd_config` y la autenticación por contraseña sigue
habilitada desde `/etc/ssh/sshd_config.d/50-cloud-init.conf`, que tiene precedencia sobre
el `PasswordAuthentication no` de `60-cloudimg-settings.conf` por orden alfabético.

**Antes de aplicar esto, confirma que puedes entrar con llave**, o te quedas fuera del servidor.

```bash
printf 'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n' | sudo tee /etc/ssh/sshd_config.d/99-hardening.conf
```

El `99-` garantiza que no lo pise otro archivo. Validar la sintaxis **antes** de recargar:

```bash
sudo sshd -t && sudo systemctl reload ssh
```

Deja la sesión actual abierta y prueba una nueva en otra terminal antes de cerrarla.

---

## §4 — Rotar credenciales de MySQL

Pendiente. Se hace **después** de §2, por separado.

`root`/`root` y `fersua`/`fersua` están en el historial de git y ahí seguirán; lo único
que las vuelve inservibles es cambiarlas. Con el puerto ya cerrado (§1) el riesgo es
bajo, pero cualquiera con acceso al servidor o a otro contenedor las tiene.

**Definir las variables en `.env` no cambia nada por sí solo.** MySQL solo aplica
`MYSQL_ROOT_PASSWORD` al inicializar un directorio de datos vacío; sobre una base que ya
existe hay que hacerlo explícito:

```bash
docker exec -it dashboard-dropshipping-mysql-1 mysql -uroot -proot
```

```sql
ALTER USER 'root'@'localhost' IDENTIFIED BY 'nueva-contrasena-root';
ALTER USER 'root'@'%' IDENTIFIED BY 'nueva-contrasena-root';
ALTER USER 'fersua'@'%' IDENTIFIED BY 'nueva-contrasena-app';
FLUSH PRIVILEGES;
```

Después, y en este orden:

1. Copiar `.env.example` a `.env` en la raíz con esos mismos valores.
2. Actualizar `DATABASE_URL` en `back/.env`.
3. `pm2 restart fersua-api` y verificar con `npx prisma migrate status`.

Si la app deja de conectar, el desajuste está entre `DATABASE_URL` y lo que se puso en
el `ALTER USER`.

---

## §5 — Otros secretos

`IMPORT_WIPE_SECRET` protege el borrado masivo desde Importaciones → zona peligrosa.
Con 17 caracteres conviene alargarlo — `openssl rand -base64 32` — y actualizarlo en
`back/.env`. Es el único freno ante un borrado accidental de todo lo importado.

---

## Nota sobre otros servicios del VPS

`wandy-api` (3085), `wandy-web` (8085) y `habitfer-caddy` (8080) también escuchan en todas
las interfaces. Quedan fuera de este documento porque son otras aplicaciones, pero vale
revisar si necesitan estar expuestas directamente o deberían ir detrás de nginx.
