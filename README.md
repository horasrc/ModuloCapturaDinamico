# Módulo Captura Dinámica (encuestas dinámicas)

Constructor de encuestas configurable para el portal **Solution_Radar**
(ASP.NET MVC · .NET Framework 4.8 · jQuery 3.7.1 · Bootstrap 5.2.3 · Bootstrap Icons).

El administrador crea, edita, ordena, duplica, elimina, publica y versiona preguntas sin programar.
Incluye 10 tipos de pregunta, lógica condicional, vista previa Desktop/Tablet/Móvil, versionado,
resultados y pantalla de captura para el usuario final.

---

## Contenido del repositorio

```
ModuloCapturaDinamico/
├── README.md                 ← este manual
├── requerimientos.txt        requerimiento original
├── Solution_Radar/           ★ ENTREGABLE: lo que se copia a la solución real del portal
│   ├── Controllers/CapturasDinamicasController.cs
│   ├── Models/ModuloDinamico/
│   ├── DataAccess/CapturasDinamicas/        (repositorio + Script_CapturaDinamica.sql)
│   ├── Views/CapturasDinamicas/
│   ├── CSS/Page2026/CapturasDinamicas/
│   ├── Scripts/CapturasDinamicas/
│   └── LEEME_CapturasDinamicas.md
└── ProyectoPrueba/           proyecto MVC mínimo para probar el módulo solo (NO se copia al portal)
    ├── Solution_Radar_Prueba.sln
    ├── Ejecutar.cmd          doble clic: sincroniza, compila y abre el navegador
    ├── Ejecutar.ps1
    ├── Sincronizar.ps1       copia Solution_Radar/ → ProyectoPrueba/Solution_Radar/
    └── Solution_Radar/       Web.config, Global.asax, layout simulado, etc.
```

> **Estado actual:** los datos son **mock en memoria** (`CapturaDinamicaRepositorioMock`).
> Se reinician cada vez que se reinicia IIS / IIS Express. Ver la sección 6 para conectar la base de datos.

---

## 1. Requisitos en la computadora del trabajo

| Requisito | Cómo verificarlo |
|---|---|
| **Visual Studio 2022** con la carga de trabajo **"Desarrollo de ASP.NET y web"** | Visual Studio Installer → Modificar → debe estar marcada. Incluye IIS Express y el paquete de destino de .NET Framework 4.8. |
| **.NET Framework 4.8 targeting pack** | Visual Studio Installer → Componentes individuales → ".NET Framework 4.8 targeting pack". |
| **Git para Windows** | En una terminal: `git --version`. Si no está: https://git-scm.com/download/win |
| **Acceso a internet** (o proxy configurado) | Para descargar paquetes NuGet (`Microsoft.AspNet.Mvc 5.2.3`) y cargar Bootstrap/jQuery desde CDN en el proyecto de prueba. |

> ⚠️ Antes de clonar código desde GitHub en un equipo corporativo, confirma que la política de tu
> empresa lo permite. El repositorio debe ser **privado**.

---

## 2. Descargar el proyecto

### Opción A — con Git (recomendada, permite actualizar después)

1. Abre **Git Bash** o **PowerShell** en la carpeta donde lo quieras, por ejemplo `C:\Proyectos`.
2. Ejecuta (cambia la URL por la de tu repositorio):
   ```
   git clone https://github.com/<tu-usuario>/ModuloCapturaDinamico.git
   ```
3. Como el repositorio es privado, se abrirá una ventana para iniciar sesión en GitHub
   (Git Credential Manager). Inicia sesión con tu cuenta y autoriza.

### Opción B — sin Git

1. Entra a la página del repositorio en GitHub (con tu sesión iniciada).
2. Botón verde **Code → Download ZIP**.
3. Descomprime el ZIP. **Importante:** antes de descomprimir, clic derecho al ZIP → Propiedades →
   marca **Desbloquear** (si aparece). Si no, Windows puede bloquear los scripts `.ps1`.

---

## 3. Probar el módulo solo (ProyectoPrueba)

### Opción A — doble clic

1. Abre la carpeta `ProyectoPrueba`.
2. Doble clic en **`Ejecutar.cmd`**.
3. El script:
   1. Copia los archivos de `Solution_Radar/` al proyecto de prueba.
   2. Restaura NuGet y compila.
   3. Inicia IIS Express en el puerto **51234** y abre el navegador.
4. Para detenerlo: en la ventana negra presiona **Ctrl + C** (o la tecla **Q** de IIS Express) y ciérrala.

### Opción B — desde Visual Studio (permite depurar)

1. Ejecuta **`ProyectoPrueba\Sincronizar.ps1`** (clic derecho → *Ejecutar con PowerShell*),
   o simplemente corre `Ejecutar.cmd` una vez.
2. Abre **`ProyectoPrueba\Solution_Radar_Prueba.sln`** con Visual Studio 2022.
3. Si pregunta por restaurar paquetes NuGet, acepta (o clic derecho a la solución → *Restaurar paquetes NuGet*).
4. Presiona **F5**. Se abre `http://localhost:51234/CapturasDinamicas/Administrador`.
5. Puedes poner *breakpoints* en `Controllers/CapturasDinamicasController.cs` y en el repositorio.

### URLs para probar

| Pantalla | URL |
|---|---|
| Listado de encuestas (administrador) | http://localhost:51234/CapturasDinamicas/Administrador |
| Constructor de la encuesta 1 | http://localhost:51234/CapturasDinamicas/Editor/1 |
| Resultados de la encuesta 1 | http://localhost:51234/CapturasDinamicas/Editor/1#resultados |
| Captura (usuario final) | http://localhost:51234/CapturasDinamicas/Captura/1 |

### Qué probar (datos de ejemplo)

- **Encuesta 1 "Experiencia con campañas comerciales"**: publicada, 11 preguntas (los 10 tipos) y 42 respuestas.
  - Pestaña **Vista previa**: en P5 elige "Sí" → aparece P6 (dependiente); "No" → aparece P7; "No aplica" → la encuesta termina.
  - Modifica cualquier pregunta y **Guardar borrador** → como la versión 1 ya tiene respuestas, se crea la **Versión 2** en borrador (clic en el badge de versión para ver el historial).
  - Pestaña **Resultados**: indicadores, barras, buscador de textos y matriz.
- **Captura**: el usuario simulado puede responder la encuesta 1 una sola vez.
- Al **reiniciar IIS Express** todo regresa al estado inicial.

---

## 4. Integrar el módulo en la solución real del portal

1. Copia el contenido de la carpeta **`Solution_Radar/`** (de este repositorio) sobre tu solución real,
   respetando las rutas:

   | Carpeta del repositorio | Destino en el portal |
   |---|---|
   | `Controllers/CapturasDinamicasController.cs` | `Controllers/` |
   | `Models/ModuloDinamico/*` | `Models/ModuloDinamico/` |
   | `DataAccess/CapturasDinamicas/*` | `DataAccess/CapturasDinamicas/` |
   | `Views/CapturasDinamicas/*` | `Views/CapturasDinamicas/` |
   | `CSS/Page2026/CapturasDinamicas/*` | `CSS/Page2026/CapturasDinamicas/` |
   | `Scripts/CapturasDinamicas/*` | `Scripts/CapturasDinamicas/` |

2. **NO copies nada de `ProyectoPrueba/`** (su `Web.config`, `Global.asax` y `_LayoutRadar2026.cshtml`
   son de prueba y sobrescribirían los del portal).
3. En Visual Studio, en el Explorador de soluciones activa **Mostrar todos los archivos** (*Show All Files*),
   selecciona las carpetas/archivos nuevos (aparecen punteados) → clic derecho → **Incluir en el proyecto**.
4. Si el espacio de nombres raíz del proyecto **no** es `Solution_Radar`, reemplázalo en los `.cs`
   (`namespace Solution_Radar...` y los `using Solution_Radar...`).
5. Compila (**Ctrl + Shift + B**) y abre `/CapturasDinamicas/Administrador`.

Las vistas usan `Layout = "~/Views/Shared/_LayoutRadar2026.cshtml"`, el que ya existe en el portal.

---

## 5. Solución de problemas

| Síntoma | Causa / solución |
|---|---|
| Acentos raros (`ConfiguraciÃ³n`) | El archivo `.cshtml` perdió la codificación. Ábrelo en VS → *Archivo → Guardar como → flecha de Guardar → Guardar con codificación → UTF-8 con firma*. |
| `Ejecutar.cmd` dice que no puede ejecutar scripts | La política de PowerShell está bloqueada por la empresa. Usa la opción B (Visual Studio + F5). Si el ZIP se descargó, desbloquéalo (sección 2B). |
| `No se encontró MSBuild` | Falta Visual Studio 2022 o la carga de trabajo web (sección 1). |
| Error al restaurar NuGet | Sin acceso a nuget.org. Configura el proxy de la empresa en VS: *Herramientas → Opciones → Administrador de paquetes NuGet*, o pide el paquete `Microsoft.AspNet.Mvc 5.2.3` al área de infraestructura. |
| Puerto 51234 ocupado | Cierra otras ventanas de IIS Express (icono en la bandeja de Windows) o cambia el puerto en `Ejecutar.ps1` y en el `.csproj`. |
| Página sin estilos | No hay acceso a los CDN de Bootstrap. En el portal real el layout usa los archivos locales, así que ahí no pasa. |
| 404 en `/Scripts/CapturasDinamicas/...` en el portal | Los archivos no se copiaron o no se incluyeron en el proyecto (sección 4, paso 3). |
| Acordeones que se abren y cierran solos en otras pantallas del portal | El `_LayoutRadar2026` carga jQuery y Bootstrap dos veces. El módulo ya está preparado para eso; se recomienda dejar una sola copia de cada librería en el layout. |
| El usuario sale como "Usuario de prueba" | No existe el objeto global `Token` en la página. En el portal lo crea `Scripts/Token/Page.js`. |

---

## 6. Siguiente paso: base de datos

1. Ejecuta `Solution_Radar/DataAccess/CapturasDinamicas/Script_CapturaDinamica.sql` en SQL Server
   (crea las tablas `portal.capturadinamica_tc_*` y `portal.capturadinamica_tp_*`).
2. Crea `CapturaDinamicaRepositorioSql` que implemente `ICapturaDinamicaRepositorio`.
3. En `CapturasDinamicasController` cambia `new CapturaDinamicaRepositorioMock()` por el repositorio SQL.
4. Las vistas y el JavaScript no cambian.

Detalle completo en `Solution_Radar/LEEME_CapturasDinamicas.md`.

---

## 7. Trabajar con Git día a día

| Acción | Comando |
|---|---|
| Traer los últimos cambios | `git pull` |
| Ver qué cambiaste | `git status` |
| Guardar tus cambios | `git add .` y luego `git commit -m "Descripción del cambio"` |
| Subirlos a GitHub | `git push` |

Si trabajas en las dos computadoras: haz siempre `git pull` antes de empezar y `git push` al terminar.
