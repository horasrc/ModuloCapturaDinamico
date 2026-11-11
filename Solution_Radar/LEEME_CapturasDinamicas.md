# Módulo Captura Dinámica — referencia técnica

Guía de instalación completa y solución de problemas: `README.md` en la raíz del repositorio.

## 1. Archivos (copiar a la misma ruta dentro de `Solution_Radar`)

```
Solution_Radar
├── Controllers
│   └── CapturasDinamicasController.cs   vistas + API JSON; elige repositorio SQL o mock
├── Models
│   └── ModuloDinamico
│       ├── CapturaDinamicaModelos.cs        (Encuesta, Pregunta, Opción, Regla, Respuesta...)
│       └── CapturaDinamicaResultados.cs     (DTO de resultados + cálculo)
├── DataAccess
│   └── CapturasDinamicas
│       ├── ICapturaDinamicaRepositorio.cs   (contrato de datos)
│       ├── CapturaDinamicaRepositorioSql.cs (SQL Server con ADO.NET)
│       ├── CapturaDinamicaRepositorioMock.cs(datos de ejemplo en memoria)
│       └── Script_CapturaDinamica.sql       (tablas portal.capturadinamica_*; se ejecuta en SSMS)
├── Views
│   └── CapturasDinamicas                    (11 archivos: copiar TODOS)
│       ├── Administrador.cshtml             vista principal: listado de encuestas
│       ├── _ListadoEncuestas.cshtml           parcial que usa Administrador
│       ├── Editor.cshtml                    vista principal: constructor de la encuesta
│       ├── _EditorEncabezado.cshtml           parcial que usa Editor (nombre, estatus, botones, pestañas)
│       ├── _EditorConstructor.cshtml          parcial que usa Editor (lista, panel, tipos de pregunta)
│       ├── _EditorConfiguracion.cshtml        parcial que usa Editor (publicación y segmentación)
│       ├── _EditorVistaPrevia.cshtml          parcial que usa Editor (Desktop / Tablet / Móvil)
│       ├── _EditorResultados.cshtml           parcial que usa Editor (resultados)
│       ├── _EditorModales.cshtml              parcial que usa Editor (modales e historial de versiones)
│       ├── Captura.cshtml                   vista principal: pantalla del usuario final
│       └── _CapturaFormulario.cshtml          parcial que usa Captura
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

Después de copiar, en Visual Studio: **Mostrar todos los archivos** → clic derecho sobre cada archivo
nuevo → **Incluir en el proyecto**. Se requiere la referencia **System.Configuration**.
Si el namespace raíz del proyecto no es `Solution_Radar`, ajústalo en los `.cs`.
Todos los archivos están en UTF-8 con firma (BOM) para que los acentos se vean bien.

## 2. URLs

| Pantalla | URL |
|---|---|
| Administrador (listado) | `/CapturasDinamicas/Administrador` |
| Constructor | `/CapturasDinamicas/Editor/{id}` (`#resultados` abre resultados) |
| Captura (usuario final) | `/CapturasDinamicas/Captura/{id}` |

Para incrustar en otra pantalla: `@Html.Action("AdministradorParcial", "CapturasDinamicas")`
o `@Html.Action("CapturaParcial", "CapturasDinamicas", new { id = 1 })`.

## 3. Notas sobre `_LayoutRadar2026`

- El layout carga **jQuery dos veces** y **Bootstrap dos veces** (bundle 5.3.2 por CDN y
  `~/Scripts/bootstrap.js` 5.2.3 sin Popper). Por eso el módulo **no usa `data-bs-toggle` /
  `data-bs-dismiss`**: pestañas, acordeones y menús son propios, y modales/offcanvas se abren
  con la API JS (`CD.ui.modal`, `CD.ui.offcanvas`). Recomendación: dejar una sola copia de cada uno.
- El usuario se toma del objeto global `Token` (`NumEmpleado`, `NombreEmpleado`, `Puesto`, `Cencos`).
- JavaScript en ES5 (sin flechas, `let/const`, template strings ni `Promise`).
- C# compatible con C# 5 (sin interpolación `$""`, `?.` ni `nameof`).

## 4. Funciones especiales

### Fecha → calendario de Outlook
- Configuración por pregunta de fecha: `PermitirCalendario`, `CalendarioPedirHora`, `CalendarioTitulo`, `CalendarioDuracion`.
- Al enviar, `cd.renderer.js` (`eventosCalendario`) arma los eventos de las fechas visibles con la casilla
  marcada y descarga el `.ics` desde `GET /CapturasDinamicas/DescargarCalendario?eventos=[...]`
  (el controller genera el iCalendar; no usa la base). Sin hora → evento de todo el día.
- La hora capturada se guarda en `ValorTexto` de la respuesta de la fecha.

### Campo llave
- `Pregunta.EsLlave` (solo texto o número, uno por encuesta, obligatorio).
- `POST /CapturasDinamicas/BuscarPorLlave (id, clave, valor)` → `BusquedaLlaveResultado` con la última
  captura de **todas las versiones** de la encuesta cuyo valor coincida (`CampoLlave.Normalizar`:
  ignora mayúsculas y espacios; en números ignora ceros decimales).
- `cd.renderer.js` (`buscarLlave` / `cargarRespuestas`) carga las respuestas e ignora preguntas u opciones
  que ya no existan en la versión actual.
- Con campo llave no aplica "una respuesta por usuario" y `CapturaDinamicaResultadosServicio` cuenta solo
  la última captura de cada valor.

## 5. Base de datos

`CapturaDinamicaRepositorioSql.cs` implementa el repositorio con ADO.NET contra las tablas
`portal.capturadinamica_*`, con las mismas reglas de negocio que el mock:

- Una versión publicada/cerrada/archivada **con respuestas no se sobrescribe**: se actualiza el
  borrador existente o se crea una versión nueva.
- Al publicar, la versión publicada anterior pasa a **Archivada** (histórico).
- **Una respuesta por usuario** cuando la versión lo indica.
- Cada guardado se hace en una transacción.

### Elección del repositorio (constructor del controller)

1. appSetting `CapturaDinamica:NombreConexion` → nombre de la cadena en `<connectionStrings>`.
2. Si no existe, busca la cadena `CapturaDinamica`.
3. Si no hay cadena → `CapturaDinamicaRepositorioMock` (memoria).

### Instalación en el portal

1. Ejecutar `Script_CapturaDinamica.sql` en SSMS sobre la base de `CNN`. Se puede ejecutar varias
   veces; al final muestra un resumen (16 tablas, 14 llaves foráneas, 6 índices).
2. En `<appSettings>` del `Web.config` del portal:
   ```xml
   <add key="CapturaDinamica:NombreConexion" value="CNN" />
   ```
3. `CapturaDinamica:CargarDatosPrueba = true` siembra encuestas de ejemplo en una base vacía.
   **Solo para pruebas**: no usarlo en el portal.

### Pendientes marcados con `TODO BD`

- Validar la **segmentación** en `ObtenerCaptura`.
- Calcular `PoblacionObjetivo` con la tabla de empleados.

El JavaScript y las vistas no dependen de la base: hablan solo con el controller mediante `cd.api.js`.
