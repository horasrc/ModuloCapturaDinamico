# Módulo Captura Dinámica (encuestas dinámicas)

Constructor de encuestas configurable para el portal **Solution_Radar**
(ASP.NET MVC · .NET Framework 4.8 · jQuery 3.7.1 · Bootstrap 5.2.3 · Bootstrap Icons · SQL Server).

El administrador crea, edita, ordena, duplica, elimina, publica y versiona preguntas sin programar.
Incluye 10 tipos de pregunta, lógica condicional, vista previa Desktop/Tablet/Móvil, versionado,
resultados y pantalla de captura para el usuario final.

Repositorio: **https://github.com/horasrc/ModuloCapturaDinamico** (privado)

---

## Índice

1. [Requisitos](#1-requisitos)
2. [Descargar el proyecto](#2-descargar-el-proyecto)
3. [Probar el módulo solo (ProyectoPrueba con LocalDB)](#3-probar-el-módulo-solo-proyectoprueba-con-localdb)
4. [Instalar en el portal real](#4-instalar-en-el-portal-real)
5. [Base de datos](#5-base-de-datos)
6. [Actualizar cuando haya cambios](#6-actualizar-cuando-haya-cambios)
7. [Solución de problemas](#7-solución-de-problemas)
8. [Trabajar con Git día a día](#8-trabajar-con-git-día-a-día)

---

## Contenido del repositorio

```
ModuloCapturaDinamico/
├── README.md                 ← este manual
├── requerimientos.txt        requerimiento original
├── Solution_Radar/           ★ ENTREGABLE: lo que se copia a la solución real del portal
│   ├── Controllers/CapturasDinamicasController.cs
│   ├── Models/ModuloDinamico/               modelos y cálculo de resultados
│   ├── DataAccess/CapturasDinamicas/        repositorios (SQL y mock) + Script_CapturaDinamica.sql
│   ├── Views/CapturasDinamicas/             vistas y vistas parciales
│   ├── CSS/Page2026/CapturasDinamicas/
│   ├── Scripts/CapturasDinamicas/
│   └── LEEME_CapturasDinamicas.md           referencia técnica del módulo
└── ProyectoPrueba/           proyecto MVC mínimo para probar el módulo solo (NO se copia al portal)
    ├── Solution_Radar_Prueba.sln
    ├── Ejecutar.cmd          doble clic: sincroniza, crea la base, compila y abre el navegador
    ├── Ejecutar.ps1
    ├── Sincronizar.ps1       copia Solution_Radar/ → ProyectoPrueba/Solution_Radar/
    ├── CrearBaseLocalDB.ps1  crea la base CapturaDinamica en LocalDB (-Recrear la reinicia)
    └── Solution_Radar/       Web.config, Global.asax, layout simulado, etc. (solo para pruebas)
```

### ¿Dónde guarda los datos el módulo?

`CapturasDinamicasController` lee el `Web.config`:

1. Si existe el appSetting `CapturaDinamica:NombreConexion`, usa la cadena de `<connectionStrings>`
   con ese nombre (en el portal: **`CNN`**).
2. Si no existe, busca una cadena llamada `CapturaDinamica` (así está el proyecto de prueba, con LocalDB).
3. Si no encuentra ninguna, usa **datos de ejemplo en memoria** (se pierden al reiniciar).

| Dónde | Conexión | Datos de ejemplo |
|---|---|---|
| Proyecto de prueba | `CapturaDinamica` → LocalDB | Sí (`CapturaDinamica:CargarDatosPrueba = true`) |
| Portal real | `CNN` (vía `CapturaDinamica:NombreConexion`) | **No**: la lista inicia vacía |

---

## 1. Requisitos

| Requisito | Cómo verificarlo |
|---|---|
| **Visual Studio 2022** con la carga de trabajo **"Desarrollo de ASP.NET y web"** | Visual Studio Installer → Modificar → debe estar marcada. Incluye IIS Express. |
| **.NET Framework 4.8 targeting pack** | Visual Studio Installer → Componentes individuales → ".NET Framework 4.8 targeting pack". |
| **SQL Server Express LocalDB** (solo para el proyecto de prueba) | En una terminal: `sqllocaldb info` (debe aparecer `MSSQLLocalDB`). Si no: Visual Studio Installer → Componentes individuales → "SQL Server Express LocalDB". |
| **SQL Server Management Studio** (para el portal real) | Para ejecutar el script de tablas en la base de `CNN`. |
| **Git para Windows** | En una terminal: `git --version`. Si no está: https://git-scm.com/download/win |
| **Acceso a internet** (o proxy configurado) | Para descargar NuGet (`Microsoft.AspNet.Mvc 5.2.3`) y cargar Bootstrap/jQuery desde CDN en el proyecto de prueba. |

> ⚠️ Antes de clonar código desde GitHub en un equipo corporativo, confirma que la política de tu
> empresa lo permite.

---

## 2. Descargar el proyecto

### Opción A — con Git (recomendada: permite actualizar con `git pull`)

```
cd C:\Proyectos
git clone https://github.com/horasrc/ModuloCapturaDinamico.git
```

Como el repositorio es privado, se abrirá el navegador para iniciar sesión en GitHub
(Git Credential Manager). Inicia sesión con la cuenta dueña del repositorio y autoriza.

### Opción B — sin Git

1. Entra a https://github.com/horasrc/ModuloCapturaDinamico con tu sesión iniciada.
2. Botón verde **Code → Download ZIP**.
3. **Antes de descomprimir:** clic derecho al ZIP → Propiedades → marca **Desbloquear** (si aparece).
   Si no, Windows puede bloquear los scripts `.ps1`.

---

## 3. Probar el módulo solo (ProyectoPrueba con LocalDB)

Sirve para ver el módulo funcionando sin tocar el portal.

### Opción A — doble clic

1. Doble clic en **`ProyectoPrueba\Ejecutar.cmd`**. El script:
   1. Copia los archivos de `Solution_Radar/` al proyecto de prueba.
   2. Crea la base `CapturaDinamica` en LocalDB con sus tablas (solo si no existe).
   3. Restaura NuGet y compila.
   4. Inicia IIS Express en el puerto **51234** y abre el navegador.
2. Al abrir el módulo por primera vez se cargan 3 encuestas de ejemplo en la base.
3. Para detenerlo: en la ventana negra presiona **Q** (o **Ctrl + C**) y ciérrala.

### Opción B — desde Visual Studio (permite depurar)

1. Corre una vez `Ejecutar.cmd`, o ejecuta `ProyectoPrueba\Sincronizar.ps1` y
   `ProyectoPrueba\CrearBaseLocalDB.ps1` (clic derecho → *Ejecutar con PowerShell*).
2. Abre **`ProyectoPrueba\Solution_Radar_Prueba.sln`** con Visual Studio 2022.
3. Si pregunta por restaurar paquetes NuGet, acepta.
4. Presiona **F5**. Puedes poner *breakpoints* en el controller y en `CapturaDinamicaRepositorioSql.cs`.

### URLs

| Pantalla | URL |
|---|---|
| Listado de encuestas (administrador) | http://localhost:51234/CapturasDinamicas/Administrador |
| Constructor de la encuesta 1 | http://localhost:51234/CapturasDinamicas/Editor/1 |
| Resultados de la encuesta 1 | http://localhost:51234/CapturasDinamicas/Editor/1#resultados |
| Captura (usuario final) | http://localhost:51234/CapturasDinamicas/Captura/1 |

### Qué probar

- **Encuesta 1 "Experiencia con campañas comerciales"**: publicada, 11 preguntas (los 10 tipos) y 42 respuestas.
  - **Vista previa**: en P5 elige "Sí" → aparece P6 (dependiente); "No" → P7; "No aplica" → la encuesta termina.
  - Modifica una pregunta y **Guardar borrador** → como la versión 1 tiene respuestas, se crea la
    **Versión 2** en borrador (clic en el badge de versión para ver el historial).
  - **Resultados**: indicadores, barras, buscador de textos y matriz.
- **Captura**: el usuario simulado puede responder la encuesta 1 una sola vez.
- Los datos **sobreviven a reinicios**. Para volver al estado inicial: cierra IIS Express y ejecuta
  `ProyectoPrueba\CrearBaseLocalDB.ps1 -Recrear`.
- Para ver las tablas: Visual Studio → *Ver → Explorador de objetos de SQL Server* →
  `(localdb)\MSSQLLocalDB` → `CapturaDinamica`.

---

## 4. Instalar en el portal real

### Paso 1 — Copiar archivos

Copia el contenido de **`Solution_Radar/`** sobre tu solución real, respetando las rutas:

| Carpeta del repositorio | Destino en el portal |
|---|---|
| `Controllers/CapturasDinamicasController.cs` | `Controllers/` |
| `Models/ModuloDinamico/*` | `Models/ModuloDinamico/` |
| `DataAccess/CapturasDinamicas/*.cs` (3 archivos) | `DataAccess/CapturasDinamicas/` |
| `Views/CapturasDinamicas/*` | `Views/CapturasDinamicas/` |
| `CSS/Page2026/CapturasDinamicas/*` | `CSS/Page2026/CapturasDinamicas/` |
| `Scripts/CapturasDinamicas/*` | `Scripts/CapturasDinamicas/` |

- `Script_CapturaDinamica.sql` **no** es necesario copiarlo al proyecto: se ejecuta en SQL Server (paso 3).
- **NO copies nada de `ProyectoPrueba/`**: su `Web.config`, `Global.asax` y `_LayoutRadar2026.cshtml`
  son de prueba y sobrescribirían los del portal.

### Paso 2 — Incluir en el proyecto

1. En el Explorador de soluciones activa **Mostrar todos los archivos** (*Show All Files*).
2. Selecciona las carpetas/archivos nuevos (aparecen punteados) → clic derecho → **Incluir en el proyecto**.
3. Verifica que el proyecto tenga la referencia **System.Configuration**
   (*Referencias → Agregar referencia → Ensamblados → System.Configuration*).
4. Si el espacio de nombres raíz **no** es `Solution_Radar`, reemplázalo en los `.cs`.

### Paso 3 — Crear las tablas

Ejecuta `Script_CapturaDinamica.sql` en la base a la que apunta `CNN`. Detalle en la [sección 5](#5-base-de-datos).

### Paso 4 — Configurar la conexión

En el `Web.config` del portal, dentro de `<appSettings>`:

```xml
<add key="CapturaDinamica:NombreConexion" value="CNN" />
```

El módulo usa la misma conexión que el resto del portal; al cambiar `CNN` de Desarrollo a
Producción, el módulo cambia también. **No** agregues `CapturaDinamica:CargarDatosPrueba` en el portal.

### Paso 5 — Probar

1. Compila (**Ctrl + Shift + B**) y abre `/CapturasDinamicas/Administrador`.
2. Resultado esperado:
   - **Lista vacía** → correcto: está leyendo la base. Crea tu primera encuesta con **Nueva encuesta**.
   - **Aparecen 3 encuestas de ejemplo** → está usando datos en memoria: revisa el paso 4.
   - **Error "Invalid object name ..."** → faltan tablas: revisa el paso 3.

Las vistas usan `Layout = "~/Views/Shared/_LayoutRadar2026.cshtml"`, el que ya existe en el portal.

---

## 5. Base de datos

### Ejecutar el script

1. Abre `Solution_Radar\DataAccess\CapturasDinamicas\Script_CapturaDinamica.sql` en **SSMS**,
   conectado al servidor de **Desarrollo**.
2. Selecciona la base de `CNN` en el combo de bases (o descomenta `USE INT_COMER;` al inicio).
3. Ejecuta con **F5**.
4. Revisa:
   - **Results**: deben aparecer **16 tablas** `capturadinamica_*` (14 llaves foráneas y 6 índices en total).
   - **Messages**: no debe haber líneas `AVISO: no se pudo crear ...`. Si hay, esa línea trae la causa.

El script se puede ejecutar **varias veces** sin problema:

- Crea el esquema `portal` solo si no existe.
- Crea cada tabla solo si no existe.
- Agrega las llaves foráneas e índices al final, uno por uno; si alguno falla muestra un `AVISO` y continúa.
- Inserta solo los registros de catálogo que falten.

Para **Producción**, pásalo por el proceso normal de cambios de la empresa.

### Esquema `portal` / `Portal`

- Si la base **no distingue mayúsculas** (collation `_CI_`, lo más común), `portal` y `Portal` son el
  mismo esquema y no hay que cambiar nada.
- Revisa la collation con: `SELECT DATABASEPROPERTYEX(DB_NAME(), 'Collation');`
- Si contiene `_CS_`, hay que cambiar `portal.` por `Portal.` en el script y en
  `CapturaDinamicaRepositorioSql.cs`.

### Permisos necesarios

`db_owner` o `db_ddladmin` en la base para crear esquema, tablas, llaves e índices.
En operación normal la aplicación solo necesita leer y escribir (`SELECT`, `INSERT`, `UPDATE`, `DELETE`)
en las tablas `portal.capturadinamica_*`.

### Tablas

| Tabla | Contenido |
|---|---|
| `portal.capturadinamica_tc_menu` | Menú del módulo |
| `portal.capturadinamica_tc_estatus` | Borrador / Publicada / Cerrada / Archivada |
| `portal.capturadinamica_tc_tipopregunta` | 10 tipos de pregunta |
| `portal.capturadinamica_tc_accionregla` | Mostrar / Ocultar / Ir a / Finalizar |
| `portal.capturadinamica_tc_operador` | Es igual / distinto / incluye / mayor / menor |
| `portal.capturadinamica_tc_tiposegmento` | Puesto / Segmento / Región / Sucursal / Usuario |
| `portal.capturadinamica_tp_encuesta` | Encuesta (Survey) |
| `portal.capturadinamica_tp_encuestaversion` | Versión + configuración de publicación |
| `portal.capturadinamica_tp_segmentacion` | Quién puede responder |
| `portal.capturadinamica_tp_pregunta` | Preguntas |
| `portal.capturadinamica_tp_preguntaopcion` | Opciones, filas y columnas de matriz |
| `portal.capturadinamica_tp_niveldependiente` | Niveles de la multiselección dependiente |
| `portal.capturadinamica_tp_opciondependiente` | Opciones encadenadas |
| `portal.capturadinamica_tp_reglacondicional` | Lógica condicional |
| `portal.capturadinamica_tp_respuestaencuesta` | Respuesta de un usuario |
| `portal.capturadinamica_tp_respuestapregunta` | Un valor capturado por fila (modelo dinámico) |

### Pendientes (marcados con `TODO BD` en el código)

- Validar la **segmentación** al capturar (`ObtenerCaptura`).
- Calcular la **población objetivo** con la tabla de empleados del portal (hoy se captura a mano en Configuración).

---

## 6. Actualizar cuando haya cambios

1. `git pull` en la carpeta del repositorio.
2. Revisa la tabla de versiones para saber qué copiar al portal.
3. Si Visual Studio estaba abierto, recarga el proyecto (clic derecho → *Descargar el proyecto* →
   *Volver a cargar el proyecto*) para que vea archivos nuevos.

| Commit | Cambio | Qué hacer en el portal |
|---|---|---|
| `f9b5604` | Primera versión del módulo (datos en memoria) | Copiar todo `Solution_Radar/` (sección 4) |
| `db7bfdc` | Conexión a SQL Server: `CapturaDinamicaRepositorioSql.cs` | Copiar los 3 `.cs` de `DataAccess/CapturasDinamicas/` y el controller; incluir el nuevo `.cs`; referencia `System.Configuration` |
| `1b44ea1` | Conexión configurable (`CapturaDinamica:NombreConexion`) | Copiar el controller; agregar el appSetting con `CNN` |
| `5205853` | Script SQL que se puede ejecutar varias veces | Volver a ejecutar el script en SSMS; no se copia código |
| *(actual)* | Manuales actualizados | Nada |

Para ver qué archivos cambiaron entre tu versión y la actual: `git log --stat` o la pestaña *Commits* en GitHub.

---

## 7. Solución de problemas

### Proyecto de prueba

| Síntoma | Solución |
|---|---|
| `Ejecutar.cmd` no puede ejecutar scripts | La política de PowerShell está bloqueada. Usa Visual Studio + F5 (sección 3, opción B). Si bajaste ZIP, desbloquéalo (sección 2). |
| `No se encontró MSBuild` | Falta Visual Studio 2022 o la carga de trabajo web (sección 1). |
| Error al restaurar NuGet | Configura el proxy en VS: *Herramientas → Opciones → Administrador de paquetes NuGet*. |
| `No se pudo conectar a (localdb)\MSSQLLocalDB` | Instala LocalDB (sección 1). Mientras tanto, borra la línea `<add name="CapturaDinamica" ...>` del `ProyectoPrueba\Solution_Radar\Web.config` para usar datos en memoria. |
| Puerto 51234 ocupado | Cierra IIS Express (icono en la bandeja de Windows) o cambia el puerto en `Ejecutar.ps1` y en el `.csproj`. |
| Página sin estilos | Sin acceso a los CDN de Bootstrap. En el portal real el layout usa archivos locales. |

### Compilación (prueba o portal)

| Síntoma | Solución |
|---|---|
| `El nombre del tipo ... 'CapturaDinamicaRepositorioSql' no se encontró` | En prueba: recarga el proyecto (*Descargar* → *Volver a cargar*). En el portal: copia `CapturaDinamicaRepositorioSql.cs` e **Inclúyelo en el proyecto**. |
| `El nombre 'ConfigurationManager' no existe` | Agrega la referencia **System.Configuration**. |
| Acentos raros (`ConfiguraciÃ³n`) | El archivo perdió la codificación. En VS: *Archivo → Guardar como → flecha de Guardar → Guardar con codificación → UTF-8 con firma*. |

### SQL Server (script en SSMS)

| Síntoma | Solución |
|---|---|
| `Foreign key ... references invalid table` / `Cannot find the object ...` | Venían de una versión anterior del script. Ejecuta el script actual (se puede correr sobre lo ya creado). |
| `AVISO: no se pudo crear ...` en Messages | Las tablas sí se crearon; solo falló esa llave o índice. Envía la línea completa para revisar la causa. |
| `CREATE SCHEMA permission denied` / `CREATE TABLE permission denied` | Falta permiso `db_ddladmin`/`db_owner`: pide al DBA que ejecute el script. |
| `There is already an object named ...` | Estás usando una versión anterior del script: haz `git pull` y usa la actual. |

### Ejecución en el portal

| Síntoma | Solución |
|---|---|
| Salen 3 encuestas de ejemplo | Usa datos en memoria: falta `CapturaDinamica:NombreConexion = CNN` en `<appSettings>`, o el nombre no coincide exactamente. |
| `Invalid object name 'portal.capturadinamica_...'` | Las tablas no existen en la base de `CNN`: ejecuta el script (sección 5). |
| `Login failed` / `Cannot open database` | El usuario con el que corre IIS / IIS Express no tiene acceso a la base de `CNN`. |
| 404 en `/Scripts/CapturasDinamicas/...` | Los archivos no se copiaron o no se incluyeron en el proyecto. |
| Acordeones que se abren y cierran solos en otras pantallas | El `_LayoutRadar2026` carga jQuery y Bootstrap dos veces. El módulo ya está preparado; se recomienda dejar una sola copia de cada librería. |
| El usuario sale como "Usuario de prueba" | No existe el objeto global `Token` en la página (lo crea `Scripts/Token/Page.js`). |

---

## 8. Trabajar con Git día a día

| Acción | Comando |
|---|---|
| Traer los últimos cambios | `git pull` |
| Ver qué cambiaste | `git status` |
| Ver el historial con archivos cambiados | `git log --stat` |
| Guardar tus cambios | `git add .` y luego `git commit -m "Descripción del cambio"` |
| Subirlos a GitHub | `git push` |

Si trabajas en las dos computadoras: haz siempre `git pull` antes de empezar y `git push` al terminar.
