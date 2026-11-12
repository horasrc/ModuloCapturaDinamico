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
│       ├── Script_CapturaDinamica.sql       (tablas portal.capturadinamica_*; se ejecuta en SSMS, no se copia)
│       └── ModeloEntidadRelacion.md         (diagrama entidad-relación; documentación, no se copia)
├── Views
│   └── CapturasDinamicas                    (12 archivos: copiar TODOS)
│       ├── Administrador.cshtml             vista principal: listado de encuestas
│       ├── _ListadoEncuestas.cshtml           parcial que usa Administrador
│       ├── Editor.cshtml                    vista principal: constructor (solo incluye _Editor con el layout)
│       ├── _Editor.cshtml                     parcial con TODO el constructor (también se carga por AJAX)
│       ├── _EditorEncabezado.cshtml             parcial que usa _Editor (nombre, estatus, botones, pestañas)
│       ├── _EditorConstructor.cshtml            parcial que usa _Editor (lista, panel, tipos de pregunta)
│       ├── _EditorConfiguracion.cshtml          parcial que usa _Editor (publicación y segmentación)
│       ├── _EditorVistaPrevia.cshtml            parcial que usa _Editor (Desktop / Tablet / Móvil)
│       ├── _EditorResultados.cshtml             parcial que usa _Editor (resultados)
│       ├── _EditorModales.cshtml                parcial que usa _Editor (modales e historial de versiones)
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

### Páginas completas (con `_LayoutRadar2026`)

| Pantalla | URL |
|---|---|
| Administrador (listado) | `/CapturasDinamicas/Administrador` |
| Constructor | `/CapturasDinamicas/Editor/{id}` (`#resultados` abre resultados) |
| Captura (usuario final) | `/CapturasDinamicas/Captura/{id}` |

### Vistas parciales (sin layout, para cargarlas por AJAX)

| Acción | Devuelve |
|---|---|
| `/CapturasDinamicas/AdministradorParcial` | `_ListadoEncuestas` (listado de encuestas) |
| `/CapturasDinamicas/EditorParcial/{id}` | `_Editor` (constructor completo). Opcional `?pestana=constructor\|configuracion\|preview\|resultados` |
| `/CapturasDinamicas/CapturaParcial/{id}` | `_CapturaFormulario` (encuesta para responder) |

Cada parcial trae su `<link>` de CSS y sus `<script>`, y se puede cargar varias veces: los eventos usan
*namespaces* (`.cdGlobal`, `.cdListado`, `.cdEditor`) y se quitan antes de registrarse, así que no se duplican.

## 3. Cómo llamar el módulo desde el portal

### Lo que necesita la página del portal

La página donde se muestre el módulo (normalmente cualquiera que use `_LayoutRadar2026`) debe tener,
**antes** de insertar la parcial:

| Requisito | En el portal lo da |
|---|---|
| jQuery 3.x | `_LayoutRadar2026` |
| Bootstrap 5 JS (para modales y offcanvas) | `_LayoutRadar2026` |
| Bootstrap CSS y Bootstrap Icons | `_LayoutRadar2026` (`~/Content/bootstrap.css`, `~/bootstrap-icons/...`) |
| Objeto global `Token` (usuario) | `~/Scripts/Token/Page.js`. Se lee al guardar y al responder, no al cargar |

### Opción A: abrir la página completa (lo más simple)

Un enlace en el menú del portal; la página ya trae el layout:

```html
<a href="@Url.Action("Administrador", "CapturasDinamicas")">Captura dinámica</a>                 <!-- administrador -->
<a href="@Url.Action("Captura", "CapturasDinamicas", new { id = 4 })">Seguimiento de visitas</a>  <!-- ejecutivos -->
```

### Opción B: cargarlo por AJAX dentro de una pantalla del portal

En la vista `.cshtml` del portal (por ejemplo, una sección de `Views/Radar/...`):

```html
<div id="cdContenedor"></div>

<script>
    // 1) URLs generadas por Razor (funciona aunque el sitio esté en un directorio virtual)
    var cdUrls = {
        listado: '@Url.Action("AdministradorParcial", "CapturasDinamicas")',
        editor:  '@Url.Action("EditorParcial", "CapturasDinamicas")',
        captura: '@Url.Action("CapturaParcial", "CapturasDinamicas")'
    };

    // 2) Navegación interna del módulo (opcional): sin esto, "Editar" y "< Encuestas" cambian de página
    window.CD = window.CD || {};
    CD.config = CD.config || { urls: {} };
    CD.config.abrirEditor = function (idEncuesta, pestana) {      // pestana: null o 'resultados'
        cdCargar(cdUrls.editor + '/' + idEncuesta + (pestana ? '?pestana=' + pestana : ''));
    };
    CD.config.abrirListado = function () {
        cdCargar(cdUrls.listado);
    };

    // 3) Carga una parcial en el contenedor
    function cdCargar(url) {
        $.ajax({ url: url, type: 'GET', cache: false })
            .done(function (html) { $('#cdContenedor').html(html); })     // .html() de jQuery: ejecuta los <script>
            .fail(function () { $('#cdContenedor').html('<div class="alert alert-danger">No se pudo cargar el módulo.</div>'); });
    }

    // 4) Qué mostrar al entrar
    $(function () {
        cdCargar(cdUrls.listado);                     // administrador: listado de encuestas
        // cdCargar(cdUrls.captura + '/4');           // ejecutivos: responder la encuesta 4
        // cdCargar(cdUrls.editor + '/1');            // abrir directo el constructor de la encuesta 1
    });
</script>
```

Reglas importantes:

- **Inserta el HTML con jQuery** (`.html()`, `.load(url)` o `.append()`). Si se inserta con
  `element.innerHTML = html`, el navegador **no ejecuta** los `<script>` de la parcial y el módulo no arranca.
- **No uses `.load('url #selector')`**: con selector, jQuery tampoco ejecuta los scripts.
- **`@Url.Action` solo funciona dentro de un `.cshtml`**. Si tu código está en un `.js`, pon las URLs en la
  vista (como `cdUrls`) o escribe la ruta completa (`/CapturasDinamicas/AdministradorParcial`), recordando
  el directorio virtual si existe.
- **Usa `cache: false`** para que IE no guarde en caché la respuesta del GET.
- **Si el portal tiene su propio helper de AJAX** (`ApiManager`, `MainAjaxSolution`...), sirve igual mientras
  pida la URL por GET y ponga el HTML con jQuery (`$('#cdContenedor').html(respuesta)`).
- `CD.config.abrirEditor` / `abrirListado` se consultan al hacer clic, así que se pueden definir antes o
  después de cargar la parcial. Ctrl + clic en "Editar" sigue abriendo la página completa en otra pestaña.
- Desde otra vista Razor (sin AJAX) también se puede usar: `@Html.Action("CapturaParcial", "CapturasDinamicas", new { id = 4 })`.

## 4. Notas sobre `_LayoutRadar2026`

- El layout del portal carga **jQuery dos veces** (CDN antes de `@RenderBody()` y `~/Scripts/jquery-3.7.1.min.js`
  después) y **Bootstrap dos veces** (bundle 5.3.2 por CDN y `~/Scripts/bootstrap.js` 5.2.3 sin Popper).
  El módulo funciona igual con o sin esas cargas repetidas: no usa `data-bs-toggle` / `data-bs-dismiss`;
  pestañas, acordeones y menús son propios, y modales/offcanvas se abren con la API JS (`CD.ui.modal`, `CD.ui.offcanvas`).
- **Recomendación** (afecta a todo el portal; probar primero en Desarrollo): dejar una sola copia, antes de
  `@RenderBody()`, con `~/Scripts/jquery-3.7.1.min.js` y `~/Scripts/bootstrap.bundle.min.js`, y comentar las
  cargas repetidas de después del `@RenderBody()`. El layout del proyecto de prueba ya está así.
- El usuario se toma del objeto global `Token` (`NumEmpleado`, `NombreEmpleado`, `Puesto`, `Cencos`).
- JavaScript en ES5 (sin flechas, `let/const`, template strings ni `Promise`).
- C# compatible con C# 5 (sin interpolación `$""`, `?.` ni `nameof`).

## 5. Funciones especiales

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

## 6. Base de datos

`CapturaDinamicaRepositorioSql.cs` implementa el repositorio con ADO.NET contra las tablas
`portal.capturadinamica_*`, con las mismas reglas de negocio que el mock. El diagrama y la explicación
del modelo están en `DataAccess/CapturasDinamicas/ModeloEntidadRelacion.md`.

- Una versión publicada/cerrada/archivada **con respuestas no se sobrescribe**: se actualiza el
  borrador existente o se crea una versión nueva.
- Al publicar, la versión publicada anterior pasa a **Archivada** (histórico).
- **Una respuesta por usuario** cuando la versión lo indica, excepto en encuestas con campo llave
  (ahí se permiten varias capturas).
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
