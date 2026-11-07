# robothealth_iron_lion_30311
This is an application web for the robothealth UI for Iron Lion 30331.

Aplicación web (React + Vite + [uPlot](https://github.com/leeoniya/uPlot)) para graficar la telemetría de los motores del robot a partir de archivos CSV.

## Uso

```bash
npm install
npm run dev        # abre http://localhost:5173
npm run build      # genera la versión estática en dist/
```

Carga un archivo con el botón **Load file**, arrastrándolo a la página o con uno de los ejemplos de `src/csv`.

### Funciones

- **Batería**: gráfica superior con línea roja de límite de salud en **11 V**; el trazo se vuelve rojo debajo del límite y se muestran estadísticas del rango visible.
- **Carrusel** de motores (flechas o teclas ← →):
  1. Tren motriz: FL, FR, BL, BR
  2. Mecanismos: Shooter Pollen, Shooter Nectar, Intake
- Cada gráfica tiene botones **RPM / A / A/s** combinables; cada unidad tiene su propio eje Y (del color de su serie) con escala automática.
- **Doble clic** en una gráfica la abre en pantalla completa (**Esc** para cerrar).
- Tecla **A**: vista general con todas las series; botones para mostrar/ocultar por motor y por métrica, y clic en la leyenda para ocultar series individuales.
- **Barra de tiempo** inferior con dos manijas: arrastra las manijas, la ventana completa, escribe inicio/fin o arrastra sobre cualquier gráfica para hacer zoom. Todas las gráficas se actualizan.
- Probado con 200,000 filas; arriba de 40,000 muestras visibles se aplica decimación min/máx para que los picos nunca se pierdan.

### Formatos de archivo

La app detecta el formato sola; el selector acepta cualquier archivo:

- **Texto delimitado** (`.csv`, `.tsv`, `.txt`, `.log`, `.dat`, sin extensión…): separador coma, punto y coma, tabulador, `|` o espacios; coma decimal (`12,5`); UTF-8, UTF-16 o Windows-1252; ignora líneas de metadatos antes del encabezado y comentarios `#` / `//`.
- **JSON**: lista de filas `[{"time_s": 0, …}]` (también anidado: `{"fl": {"rpm": …}}` → `fl_rpm`), columnas `{"time_s": [...], …}`, envoltorios como `{"samples": [...]}` y **NDJSON** (un objeto por línea).
- **Excel** `.xlsx` / `.xlsm`: primera hoja con datos (fechas incluidas). Los `.xls` antiguos no: guárdalos como `.xlsx` o `.csv`.
- **ZIP** con un archivo de datos dentro y archivos **`.gz`**.

Columnas esperadas:

```
time_s,battery_volts,fl_rpm,fl_current_a,fl_current_rate_aps,fr_...,bl_...,br_...,shooter_p_...,shooter_n_...,intake_...
```

- Los nombres no distinguen mayúsculas, espacios ni símbolos (`Battery Volts` → `battery_volts`).
- **Tiempo**: si no hay `time_s`, se usa `time`, `t`, `timestamp`, `tiempo`, `time_ms` (ms → s), `time_us`, horas `hh:mm:ss` o fechas; los timestamps epoch se muestran en segundos desde la primera muestra. Sin columna de tiempo, se usa el número de fila.
- Sin encabezado y con 23 columnas, se asume el orden estándar.
- Si falta una columna, su botón aparece deshabilitado. Celdas vacías o no numéricas toman el valor anterior; columnas de texto se ignoran.
- Un aviso azul arriba de las gráficas explica cualquier interpretación automática.

Para generar un CSV grande de prueba: `npm run sample -- 100000 big.csv`.
