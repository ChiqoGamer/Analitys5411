# MVP 5411 — Dashboard de previsibilidad de volumen

Proyecto arrancador: backend en Node/Express que lee Order History desde Google Sheets, y frontend en React que muestra un gráfico filtrable por marca.

## 1. Google Cloud — una sola vez

1. Entrar a https://console.cloud.google.com y crear un proyecto nuevo.
2. "APIs & Services" → "Library" → buscar **Google Sheets API** → Enable.
3. "APIs & Services" → "Credentials" → **Create Credentials** → **Service Account**.
4. Dentro de la cuenta de servicio creada → pestaña **Keys** → **Add Key** → **JSON**. Se descarga un archivo.
5. Renombrar ese archivo a `service-account.json` y colocarlo dentro de la carpeta `/backend`.
6. Abrir ese JSON, copiar el valor de `client_email` (algo como `xxxx@xxxx.iam.gserviceaccount.com`).
7. Ir al Google Sheet de Order History → botón "Compartir" → pegar ese email → dar permiso de **Lector**.

**Importante:** `service-account.json` nunca se sube a GitHub (ya está en el `.gitignore`). Son credenciales sensibles.

## 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Editar `.env`:
- `SHEET_ID`: se saca de la URL del Sheet → `https://docs.google.com/spreadsheets/d/AQUI_ESTA_EL_ID/edit`
- `SHEET_RANGE`: el nombre de la pestaña + rango de columnas reales de Order History (ej: `OrderHistory!A:F`)

Ajustar también en `server.js`, dentro de `parseRows()`, qué columna corresponde a marca / órdenes / unidades — hoy está armado como ejemplo con las primeras 3 columnas.

Correr:
```bash
npm run dev
```

Debería levantar en `http://localhost:4000`. Probar en el navegador: `http://localhost:4000/api/order-history` — tiene que devolver un JSON con los datos.

## 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Se abre en `http://localhost:5173` (o el puerto que indique Vite). Con el backend corriendo en paralelo, el dashboard va a mostrar el gráfico con el filtro por marca.

## 4. Próximos pasos sugeridos

- Ajustar `parseRows()` en `server.js` a las columnas reales de Order History
- Sumar más filtros (por tipo de orden Major/Boutique, por fecha) si Delfi los pide
- Cuando esté listo: subir a GitHub (con `.gitignore` ya armado para no filtrar credenciales) y deployar en Railway
- En Railway, las credenciales de Google (contenido del `service-account.json`) conviene pasarlas como variable de entorno en vez de subir el archivo — se puede ajustar `server.js` para leer las credenciales desde una variable de entorno en producción
