# Módulo Captura Dinámica (encuestas dinámicas)

## 1. Archivos (copiar a la misma ruta dentro de `Solution_Radar`)

```
Solution_Radar
├── Controllers
│   └── CapturasDinamicasController.cs
├── Models
│   └── ModuloDinamico
│       ├── CapturaDinamicaModelos.cs        (Encuesta, Pregunta, Opción, Regla, Respuesta...)
│       └── CapturaDinamicaResultados.cs     (DTO de resultados + cálculo)
├── DataAccess
│   └── CapturasDinamicas
│       ├── ICapturaDinamicaRepositorio.cs   (contrato de datos)
│       ├── CapturaDinamicaRepositorioMock.cs(datos mock en memoria)
│       └── Script_CapturaDinamica.sql       (tablas portal.capturadinamica_*)
├── Views
│   └── CapturasDinamicas
│       ├── Administrador.cshtml   -> _ListadoEncuestas.cshtml
│       ├── Editor.cshtml          -> _EditorEncabezado, _EditorConstructor, _EditorConfiguracion,
│       │                             _EditorVistaPrevia, _EditorResultados, _EditorModales
│       └── Captura.cshtml         -> _CapturaFormulario.cshtml
├── CSS
│   └── Page2026
│       └── CapturasDinamicas
│           └── CapturasDinamicas.css
└── Scripts
    └── CapturasDinamicas
        ├── cd.core.js        utilerías, catálogo de tipos, Token, toasts/modales
        ├── cd.api.js         ÚNICO punto de llamadas AJAX
        ├── cd.renderer.js    dibuja la encuesta, lógica condicional y validaciones
        ├── cd.editor.js      constructor (lista, panel, reglas, configuración, vista previa)
        ├── cd.resultados.js  pestaña Resultados
        ├── cd.listado.js     listado del administrador
        └── cd.captura.js     pantalla del usuario final
```

**Importante (proyecto .NET Framework):** después de copiar, en Visual Studio activa
*Show All Files* en el Solution Explorer, clic derecho sobre cada carpeta/archivo nuevo →
**Include In Project**. Si el namespace raíz del proyecto no es `Solution_Radar`, ajústalo en los `.cs`.

## 2. URLs

| Pantalla | URL |
|---|---|
| Administrador (listado) | `/CapturasDinamicas/Administrador` |
| Constructor | `/CapturasDinamicas/Editor/1` (`#resultados` abre resultados) |
| Captura (usuario final) | `/CapturasDinamicas/Captura/1` |

Para incrustar en otra pantalla: `@Html.Action("AdministradorParcial", "CapturasDinamicas")`
o `@Html.Action("CapturaParcial", "CapturasDinamicas", new { id = 1 })`.

## 3. Notas sobre `_LayoutRadar2026`

- El layout carga **jQuery dos veces** y **Bootstrap dos veces** (bundle 5.3.2 por CDN y
  `~/Scripts/bootstrap.js` 5.2.3 sin Popper). Por eso el módulo **no usa `data-bs-toggle` /
  `data-bs-dismiss`**: pestañas, acordeones y menús son propios, y modales/offcanvas se abren
  con la API JS (`CD.ui.modal`, `CD.ui.offcanvas`). Recomendación: dejar una sola copia de cada uno.
- El usuario se toma del objeto global `Token` (`NumEmpleado`, `NombreEmpleado`, `Puesto`, `Cencos`).
- JavaScript en ES5 (sin flechas, `let/const`, template strings ni `Promise`).

## 4. Dónde conectar el backend

1. Ejecutar `Script_CapturaDinamica.sql`.
2. Crear `CapturaDinamicaRepositorioSql : ICapturaDinamicaRepositorio` en `DataAccess/CapturasDinamicas`
   con la conexión del portal. Cada método del Mock documenta la regla de negocio a respetar
   (versionado, una respuesta por usuario, fechas, etc.).
3. En `CapturasDinamicasController` cambiar
   `new CapturaDinamicaRepositorioMock()` por `new CapturaDinamicaRepositorioSql()`.
4. Pendientes marcados con `TODO BD`: validar la **segmentación** en `ObtenerCaptura`
   y calcular `PoblacionObjetivo` con la tabla de empleados.

El JavaScript y las vistas no cambian: hablan solo con el controller mediante `cd.api.js`.
