# robothealth_iron_lion_30311
This is an application web for the robothealth UI for Iron Lion 30331.

Aplicación web (React + Vite + [uPlot](https://github.com/leeoniya/uPlot)) para graficar la telemetría de los motores del robot a partir de archivos CSV.

## Uso

```bash
npm install
npm run dev        # abre http://localhost:5173
npm run build      # genera la versión estática en dist/
```

Carga un CSV con el botón **Cargar CSV**, arrastrándolo a la página o con uno de los ejemplos de `src/csv`.

### Funciones

- **Batería**: gráfica superior con línea roja de límite de salud en **9.5 V**; el trazo se vuelve rojo debajo del límite y se muestran estadísticas del rango visible.
- **Carrusel** de motores (flechas o teclas ← →):
  1. Tren motriz: FL, FR, BL, BR
  2. Mecanismos: Shooter Pollen, Shooter Nectar, Intake
- Cada gráfica tiene botones **RPM / A / A/s** combinables; cada unidad tiene su propio eje Y (del color de su serie) con escala automática.
- **Doble clic** en una gráfica la abre en pantalla completa (**Esc** para cerrar).
- Tecla **A**: vista general con todas las series; botones para mostrar/ocultar por motor y por métrica, y clic en la leyenda para ocultar series individuales.
- **Barra de tiempo** inferior con dos manijas: arrastra las manijas, la ventana completa, escribe inicio/fin o arrastra sobre cualquier gráfica para hacer zoom. Todas las gráficas se actualizan.
- Probado con 200,000 filas; arriba de 40,000 muestras visibles se aplica decimación min/máx para que los picos nunca se pierdan.

### Formato del CSV

```
time_s,battery_volts,fl_rpm,fl_current_a,fl_current_rate_aps,fr_...,bl_...,br_...,shooter_p_...,shooter_n_...,intake_...
```

Si falta una columna, su botón aparece deshabilitado. Celdas vacías o no numéricas toman el valor anterior.

Para generar un CSV grande de prueba: `npm run sample -- 100000 big.csv`.
