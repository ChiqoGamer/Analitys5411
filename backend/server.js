import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 4000;

// ---- Config de Google Sheets ----
// SHEET_ID: lo sacás de la URL del Google Sheet
// https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit
const SHEET_ID = process.env.SHEET_ID
const SHEET_RANGE = process.env.SHEET_RANGE || "OrderHistory!A:AC"; // ajustar al rango real

// Credenciales de la cuenta de servicio.
// - En producción (ej. hosting): definir GOOGLE_CREDENTIALS_JSON con el JSON
//   completo del service account como string. Evita subir el archivo al server.
// - En desarrollo: si esa variable no existe, se usa ./service-account.json
//   como fallback (el archivo descargado de Google Cloud, no versionado).
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

const authOptions = { scopes: SCOPES };
if (process.env.GOOGLE_CREDENTIALS_JSON) {
  try {
    authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    console.log("Credenciales de Google cargadas desde GOOGLE_CREDENTIALS_JSON");
  } catch (err) {
    throw new Error(
      `GOOGLE_CREDENTIALS_JSON no es un JSON válido: ${err.message}`
    );
  }
} else {
  authOptions.keyFile = "./service-account.json"; // fallback local (no lo subas a GitHub)
  console.log("Credenciales de Google cargadas desde ./service-account.json (fallback local)");
}

const auth = new google.auth.GoogleAuth(authOptions);

const sheets = google.sheets({ version: "v4", auth });

// ---- Cache en memoria del Sheet ----
// Delfi solo necesita un corte diario, no tiene sentido pegarle a la API de
// Google en cada request. Traemos los datos una vez, los guardamos en memoria y
// todas las consultas (por marca, por mes) se resuelven contra esa copia.
const CACHE_TTL_MS = 1000 * 60 * 15; // 15 minutos, ajustable
let cache = { data: null, fetchedAt: null };

async function getSheetData() {
  const cacheValido =
    cache.data && cache.fetchedAt && Date.now() - cache.fetchedAt < CACHE_TTL_MS;

  if (cacheValido) return cache;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE,
  });

  const data = parseRows(response.data.values);
  cache = { data, fetchedAt: Date.now() };
  console.log(`Datos leídos de Google Sheets: ${data.length} registros (cache refrescado)`);
  return cache;
}

// Normaliza una fecha del Sheet (formato mes/día/año, ej. "7/16/2026") a ISO
// "YYYY-MM-DD", que es lo que esperan los filtros por mes/rango. Devuelve null
// si el valor no tiene la forma esperada.
function toISODate(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mes, dia, anio] = m;
  return `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

// Los nombres de marca vienen migrados de otros sheets como
// "Nombre de marca tracker <año>". Nos quedamos con lo anterior a "tracker";
// todo lo que sigue (tracker + año) no sirve para el filtro.
function limpiarNombreMarca(raw) {
  if (!raw) return null;
  const nombre = String(raw).split(/tracker/i)[0].trim();
  return nombre || null;
}

// Convierte filas crudas del Sheet en objetos por orden (una fila = una orden)
// AJUSTAR los índices de columna según cómo esté armado realmente Order History
function parseRows(rows) {
  if (!rows || rows.length < 2) return [];

  const [header, ...dataRows] = rows;

  return dataRows
    .map((row, index) => ({
      registroNroSheets: index + 2, // fila real en el Sheet (1 = header, así que datos arrancan en fila 2)
      marca: limpiarNombreMarca(row[0]), // columna A (se le quita el sufijo "tracker <año>")
      customer: row[2]?.trim() || null, // columna C
      tipoCustomer: row[28]?.trim() || null, // columna AC
      ordenID: String(row[3]) || 0,
      unidades: Number(row[16]) || 0,
      orden: 1, // cada fila = 1 orden, se cuenta, no se suma ninguna columna
      startDate: toISODate(row[7]), // columna H = Start Date (apertura de la ventana de envío), mes/día/año → ISO. Referencia para previsibilidad
    }))
    .filter((r) => r.marca);
}

// Clave canónica para comparar texto: sin distinción de mayúsculas/minúsculas
// ni espacios extra, así "Nike", "nike" y "NIKE " cuentan como lo mismo.
function normalizeKey(valor) {
  return String(valor || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Aplica los filtros recibidos y devuelve las filas (órdenes) que pasan.
function filtrar(data, { marca, customer, tipoCustomer, mes, desde, hasta }) {
  let filtrado = data;

  if (marca) {
    const clave = normalizeKey(marca);
    filtrado = filtrado.filter((r) => normalizeKey(r.marca) === clave);
  }

  if (customer) {
    const clave = normalizeKey(customer);
    filtrado = filtrado.filter((r) => normalizeKey(r.customer) === clave);
  }

  if (tipoCustomer) {
    const clave = normalizeKey(tipoCustomer);
    filtrado = filtrado.filter((r) => normalizeKey(r.tipoCustomer) === clave);
  }

  if (mes) {
    // mes esperado como "2026-07"
    filtrado = filtrado.filter((r) => r.startDate && r.startDate.startsWith(mes));
  }

  if (desde || hasta) {
    filtrado = filtrado.filter((r) => {
      if (!r.startDate) return false;
      const f = new Date(r.startDate);
      if (desde && f < new Date(desde)) return false;
      if (hasta && f > new Date(hasta)) return false;
      return true;
    });
  }

  return filtrado;
}

// Agrupa filas por un campo de texto y suma órdenes/unidades.
// El nombre a mostrar es el primero que aparezca para esa clave (ya trimeado).
function agruparPor(rows, campo) {
  const grupos = {};
  for (const r of rows) {
    const valor = r[campo];
    if (!valor) continue;
    const clave = normalizeKey(valor);
    if (!grupos[clave]) grupos[clave] = { [campo]: String(valor).trim(), ordenes: 0, unidades: 0 };
    grupos[clave].ordenes += r.orden;
    grupos[clave].unidades += r.unidades;
  }
  return Object.values(grupos);
}

// Serie temporal: suma órdenes/unidades por mes (YYYY-MM), ordenada ascendente.
function serieMensual(rows) {
  const grupos = {};
  for (const r of rows) {
    if (!r.startDate) continue;
    const mes = r.startDate.slice(0, 7); // "YYYY-MM"
    if (!grupos[mes]) grupos[mes] = { mes, ordenes: 0, unidades: 0 };
    grupos[mes].ordenes += r.orden;
    grupos[mes].unidades += r.unidades;
  }
  return Object.values(grupos).sort((a, b) => a.mes.localeCompare(b.mes));
}

// Totales de cabecera (KPIs) sobre las filas ya filtradas.
function calcularKpis(rows) {
  let totalOrdenes = 0;
  let totalUnidades = 0;
  const marcas = new Set();
  const customers = new Set();
  for (const r of rows) {
    totalOrdenes += r.orden;
    totalUnidades += r.unidades;
    if (r.marca) marcas.add(normalizeKey(r.marca));
    if (r.customer) customers.add(normalizeKey(r.customer));
  }
  const unidadesPorOrden = totalOrdenes ? totalUnidades / totalOrdenes : 0;
  return {
    totalOrdenes,
    totalUnidades,
    cantidadMarcas: marcas.size,
    cantidadCustomers: customers.size,
    unidadesPorOrden,
  };
}

app.get("/api/order-history", async (req, res) => {
  try {
    const { data, fetchedAt } = await getSheetData();
    const { marca, customer, tipoCustomer, mes, desde, hasta } = req.query;
    const rows = filtrar(data, { marca, customer, tipoCustomer, mes, desde, hasta });

    res.json({
      data: agruparPor(rows, "marca"), // por marca (compat. con lo anterior)
      porTipoCustomer: agruparPor(rows, "tipoCustomer"),
      serieMensual: serieMensual(rows),
      kpis: calcularKpis(rows),
      fetchedAt: new Date(fetchedAt).toISOString(),
    });
    console.log(`Request a /api/order-history con filtros: marca=${marca}, customer=${customer}, tipoCustomer=${tipoCustomer}, mes=${mes}, desde=${desde}, hasta=${hasta} → ${rows.length} órdenes, ${agruparPor(rows, "marca").length} marcas`);
  } catch (err) {
    console.error("Error leyendo Google Sheets:", err.message);
    res.status(500).json({ error: "No se pudo leer el Sheet", detail: err.message });
  }
});

// Valores únicos para poblar los selectores del frontend (marca, customer,
// tipo de customer). Ordenados alfabéticamente y sin distinción de caso/espacios.
//
// Cascada: las opciones se recortan según lo ya elegido "más arriba" en la
// jerarquía marca → customer → tipoCustomer. Así, al elegir una marca, el
// dropdown de customers solo muestra los customers que tienen órdenes de esa
// marca; al elegir además un customer, tipoCustomer se recorta a ese subconjunto.
// Cada lista se calcula sobre su propio subconjunto para no auto-recortarse
// (elegir un customer no debe borrar a los demás de su propio dropdown).
app.get("/api/order-history/opciones", async (req, res) => {
  try {
    const { data } = await getSheetData();
    const { marca, customer } = req.query;

    const unicos = (rows, campo) => {
      const vistos = new Map(); // clave normalizada → primer valor original
      for (const r of rows) {
        const valor = r[campo];
        if (!valor) continue;
        const clave = normalizeKey(valor);
        if (!vistos.has(clave)) vistos.set(clave, valor.trim());
      }
      return [...vistos.values()].sort((a, b) => a.localeCompare(b, "es"));
    };

    res.json({
      marcas: unicos(data, "marca"), // todas, siempre
      customers: unicos(filtrar(data, { marca }), "customer"), // recortado por marca
      tiposCustomer: unicos(filtrar(data, { marca, customer }), "tipoCustomer"), // por marca + customer
    });
  } catch (err) {
    console.error("Error leyendo Google Sheets:", err.message);
    res.status(500).json({ error: "No se pudo leer el Sheet", detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});
