/* =====================================================================
   MÓDULO CAPTURA DINÁMICA - Script de base de datos (SQL Server)

   Nomenclatura:  portal.capturadinamica_<tc|tp>_<accion>
       tc = catálogo
       tp = proceso
   Ejemplo: portal.capturadinamica_tc_menu -> catálogo del menú del módulo.

   Modelo dinámico de respuestas: NO existen columnas pregunta1, pregunta2...
   Cada valor capturado es una FILA en capturadinamica_tp_respuestapregunta.

   Equivalencia con las entidades propuestas:
     Survey           -> portal.capturadinamica_tp_encuesta
     SurveyVersion    -> portal.capturadinamica_tp_encuestaversion
     Question         -> portal.capturadinamica_tp_pregunta
     QuestionType     -> portal.capturadinamica_tc_tipopregunta
     QuestionOption   -> portal.capturadinamica_tp_preguntaopcion
     DependentOption  -> portal.capturadinamica_tp_niveldependiente + portal.capturadinamica_tp_opciondependiente
     ConditionalRule  -> portal.capturadinamica_tp_reglacondicional
     SurveyResponse   -> portal.capturadinamica_tp_respuestaencuesta
     QuestionResponse -> portal.capturadinamica_tp_respuestapregunta
   ===================================================================== */

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'portal')
    EXEC('CREATE SCHEMA portal');
GO

/* =====================================================================
   CATÁLOGOS (tc)
   ===================================================================== */

-- Menú del módulo
CREATE TABLE portal.capturadinamica_tc_menu (
    IdMenu          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tc_menu PRIMARY KEY,
    Nombre          NVARCHAR(100)     NOT NULL,
    Controlador     VARCHAR(100)      NOT NULL,
    Accion          VARCHAR(100)      NOT NULL,
    Icono           VARCHAR(50)       NULL,
    Orden           INT               NOT NULL DEFAULT(0),
    Activo          BIT               NOT NULL DEFAULT(1)
);
GO

-- Estatus de encuesta / versión
CREATE TABLE portal.capturadinamica_tc_estatus (
    IdEstatus       TINYINT           NOT NULL CONSTRAINT PK_capturadinamica_tc_estatus PRIMARY KEY,
    Clave           VARCHAR(20)       NOT NULL CONSTRAINT UQ_capturadinamica_tc_estatus_Clave UNIQUE,
    Descripcion     NVARCHAR(100)     NOT NULL
);
GO

-- Tipos de pregunta (QuestionType)
CREATE TABLE portal.capturadinamica_tc_tipopregunta (
    IdTipoPregunta  TINYINT           NOT NULL CONSTRAINT PK_capturadinamica_tc_tipopregunta PRIMARY KEY,
    Clave           VARCHAR(20)       NOT NULL CONSTRAINT UQ_capturadinamica_tc_tipopregunta_Clave UNIQUE,
    Nombre          NVARCHAR(60)      NOT NULL,
    Descripcion     NVARCHAR(150)     NULL,
    Icono           VARCHAR(50)       NULL,       -- Bootstrap Icons
    UsaOpciones     BIT               NOT NULL DEFAULT(0),
    PermiteOtro     BIT               NOT NULL DEFAULT(0),
    Activo          BIT               NOT NULL DEFAULT(1)
);
GO

-- Acciones de lógica condicional
CREATE TABLE portal.capturadinamica_tc_accionregla (
    IdAccion        TINYINT           NOT NULL CONSTRAINT PK_capturadinamica_tc_accionregla PRIMARY KEY,
    Clave           VARCHAR(20)       NOT NULL CONSTRAINT UQ_capturadinamica_tc_accionregla_Clave UNIQUE,
    Nombre          NVARCHAR(60)      NOT NULL,
    RequiereDestino BIT               NOT NULL
);
GO

-- Operadores de comparación de las reglas
CREATE TABLE portal.capturadinamica_tc_operador (
    IdOperador      TINYINT           NOT NULL CONSTRAINT PK_capturadinamica_tc_operador PRIMARY KEY,
    Clave           VARCHAR(20)       NOT NULL CONSTRAINT UQ_capturadinamica_tc_operador_Clave UNIQUE,
    Nombre          NVARCHAR(60)      NOT NULL
);
GO

-- Tipos de segmentación (quién puede responder)
CREATE TABLE portal.capturadinamica_tc_tiposegmento (
    IdTipoSegmento  TINYINT           NOT NULL CONSTRAINT PK_capturadinamica_tc_tiposegmento PRIMARY KEY,
    Clave           VARCHAR(20)       NOT NULL CONSTRAINT UQ_capturadinamica_tc_tiposegmento_Clave UNIQUE,
    Nombre          NVARCHAR(60)      NOT NULL
);
GO

/* =====================================================================
   PROCESO (tp) - DEFINICIÓN DE ENCUESTAS
   ===================================================================== */

-- Encuesta (Survey)
CREATE TABLE portal.capturadinamica_tp_encuesta (
    IdEncuesta          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_encuesta PRIMARY KEY,
    Nombre              NVARCHAR(150)     NOT NULL,
    Descripcion         NVARCHAR(300)     NULL,
    Activo              BIT               NOT NULL DEFAULT(1),
    FechaAlta           DATETIME          NOT NULL DEFAULT(GETDATE()),
    NumEmpleadoAlta     VARCHAR(20)       NULL,
    FechaModificacion   DATETIME          NULL,
    NumEmpleadoModifica VARCHAR(20)       NULL
);
GO

-- Versión de la encuesta (SurveyVersion) + configuración de publicación
CREATE TABLE portal.capturadinamica_tp_encuestaversion (
    IdVersion             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_encuestaversion PRIMARY KEY,
    IdEncuesta            INT               NOT NULL CONSTRAINT FK_cd_version_encuesta REFERENCES portal.capturadinamica_tp_encuesta(IdEncuesta),
    NumeroVersion         INT               NOT NULL,
    IdEstatus             TINYINT           NOT NULL CONSTRAINT FK_cd_version_estatus REFERENCES portal.capturadinamica_tc_estatus(IdEstatus),
    FechaInicio           DATE              NULL,
    FechaCierre           DATE              NULL,
    RespuestaUnica        BIT               NOT NULL DEFAULT(1),
    Anonima               BIT               NOT NULL DEFAULT(0),
    RequiereAutenticacion BIT               NOT NULL DEFAULT(1),
    MensajeInicial        NVARCHAR(500)     NULL,
    MensajeFinal          NVARCHAR(500)     NULL,
    PoblacionObjetivo     INT               NOT NULL DEFAULT(0),
    FechaAlta             DATETIME          NOT NULL DEFAULT(GETDATE()),
    NumEmpleadoAlta       VARCHAR(20)       NULL,
    NombreEmpleadoAlta    NVARCHAR(150)     NULL,
    FechaPublicacion      DATETIME          NULL,
    NumEmpleadoPublica    VARCHAR(20)       NULL,
    CONSTRAINT UQ_cd_version_numero UNIQUE (IdEncuesta, NumeroVersion)
);
GO
-- Solo puede existir UNA versión publicada (IdEstatus = 2) por encuesta
CREATE UNIQUE INDEX UX_cd_version_publicada ON portal.capturadinamica_tp_encuestaversion (IdEncuesta) WHERE IdEstatus = 2;
GO

-- Segmentación por versión
CREATE TABLE portal.capturadinamica_tp_segmentacion (
    IdSegmentacion  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_segmentacion PRIMARY KEY,
    IdVersion       INT               NOT NULL CONSTRAINT FK_cd_segmentacion_version REFERENCES portal.capturadinamica_tp_encuestaversion(IdVersion),
    Clave           VARCHAR(40)       NOT NULL,
    IdTipoSegmento  TINYINT           NOT NULL CONSTRAINT FK_cd_segmentacion_tipo REFERENCES portal.capturadinamica_tc_tiposegmento(IdTipoSegmento),
    Valor           NVARCHAR(100)     NOT NULL
);
GO

-- Pregunta (Question). "Clave" es estable entre versiones y es la que usan reglas y respuestas.
CREATE TABLE portal.capturadinamica_tp_pregunta (
    IdPregunta        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_pregunta PRIMARY KEY,
    IdVersion         INT               NOT NULL CONSTRAINT FK_cd_pregunta_version REFERENCES portal.capturadinamica_tp_encuestaversion(IdVersion),
    Clave             VARCHAR(40)       NOT NULL,
    Orden             INT               NOT NULL,
    IdTipoPregunta    TINYINT           NOT NULL CONSTRAINT FK_cd_pregunta_tipo REFERENCES portal.capturadinamica_tc_tipopregunta(IdTipoPregunta),
    Texto             NVARCHAR(500)     NOT NULL,
    Descripcion       NVARCHAR(300)     NULL,
    Obligatoria       BIT               NOT NULL DEFAULT(0),
    OrdenAleatorio    BIT               NOT NULL DEFAULT(0),
    PermitirOtro      BIT               NOT NULL DEFAULT(0),
    TextoLargo        BIT               NOT NULL DEFAULT(0),
    MinCaracteres     INT               NULL,
    MaxCaracteres     INT               NULL,
    MinSelecciones    INT               NULL,
    MaxSelecciones    INT               NULL,
    ValorMinimo       DECIMAL(18,4)     NULL,
    ValorMaximo       DECIMAL(18,4)     NULL,
    PermitirDecimales BIT               NOT NULL DEFAULT(0),
    EscalaMinimo      INT               NULL,
    EscalaMaximo      INT               NULL,
    EtiquetaMinimo    NVARCHAR(40)      NULL,
    EtiquetaMaximo    NVARCHAR(40)      NULL,
    FechaMinima       DATE              NULL,
    FechaMaxima       DATE              NULL,
    CONSTRAINT UQ_cd_pregunta_clave UNIQUE (IdVersion, Clave)
);
GO

-- Opciones de respuesta, filas y columnas de matriz (QuestionOption)
--   TipoOpcion: 'O' = opción, 'F' = fila de matriz, 'C' = columna de matriz
CREATE TABLE portal.capturadinamica_tp_preguntaopcion (
    IdOpcion    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_preguntaopcion PRIMARY KEY,
    IdPregunta  INT               NOT NULL CONSTRAINT FK_cd_opcion_pregunta REFERENCES portal.capturadinamica_tp_pregunta(IdPregunta),
    Clave       VARCHAR(40)       NOT NULL,
    TipoOpcion  CHAR(1)           NOT NULL CONSTRAINT CK_cd_opcion_tipo CHECK (TipoOpcion IN ('O','F','C')),
    Texto       NVARCHAR(200)     NOT NULL,
    Orden       INT               NOT NULL
);
GO
CREATE INDEX IX_cd_opcion_pregunta ON portal.capturadinamica_tp_preguntaopcion (IdPregunta, TipoOpcion, Orden);
GO

-- Niveles de la multiselección dependiente (Banca / Producto / Recurso)
CREATE TABLE portal.capturadinamica_tp_niveldependiente (
    IdNivel          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_niveldependiente PRIMARY KEY,
    IdPregunta       INT               NOT NULL CONSTRAINT FK_cd_nivel_pregunta REFERENCES portal.capturadinamica_tp_pregunta(IdPregunta),
    Nivel            TINYINT           NOT NULL,
    Nombre           NVARCHAR(60)      NOT NULL,
    PermitirMultiple BIT               NOT NULL DEFAULT(0),
    CONSTRAINT UQ_cd_nivel UNIQUE (IdPregunta, Nivel)
);
GO

-- Opciones dependientes (DependentOption): ClavePadre apunta a la opción del nivel anterior
CREATE TABLE portal.capturadinamica_tp_opciondependiente (
    IdOpcionDependiente INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_opciondependiente PRIMARY KEY,
    IdPregunta          INT               NOT NULL CONSTRAINT FK_cd_opdep_pregunta REFERENCES portal.capturadinamica_tp_pregunta(IdPregunta),
    Clave               VARCHAR(40)       NOT NULL,
    Nivel               TINYINT           NOT NULL,
    ClavePadre          VARCHAR(40)       NULL,
    Texto               NVARCHAR(120)     NOT NULL,
    Orden               INT               NOT NULL
);
GO
CREATE INDEX IX_cd_opdep_padre ON portal.capturadinamica_tp_opciondependiente (IdPregunta, Nivel, ClavePadre);
GO

-- Lógica condicional (ConditionalRule): SI respuesta <operador> <valor> ENTONCES <accion> <destino>
CREATE TABLE portal.capturadinamica_tp_reglacondicional (
    IdRegla              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_reglacondicional PRIMARY KEY,
    IdPregunta           INT               NOT NULL CONSTRAINT FK_cd_regla_pregunta REFERENCES portal.capturadinamica_tp_pregunta(IdPregunta),
    Clave                VARCHAR(40)       NOT NULL,
    IdOperador           TINYINT           NOT NULL CONSTRAINT FK_cd_regla_operador REFERENCES portal.capturadinamica_tc_operador(IdOperador),
    Valor                NVARCHAR(200)     NOT NULL,   -- clave de opción o valor literal
    IdAccion             TINYINT           NOT NULL CONSTRAINT FK_cd_regla_accion REFERENCES portal.capturadinamica_tc_accionregla(IdAccion),
    ClavePreguntaDestino VARCHAR(40)       NULL,       -- NULL cuando la acción es "finalizar"
    Orden                INT               NOT NULL
);
GO

/* =====================================================================
   PROCESO (tp) - RESPUESTAS (modelo dinámico)
   ===================================================================== */

-- Respuesta de un usuario a una versión (SurveyResponse)
CREATE TABLE portal.capturadinamica_tp_respuestaencuesta (
    IdRespuesta     BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_respuestaencuesta PRIMARY KEY,
    IdVersion       INT                  NOT NULL CONSTRAINT FK_cd_respuesta_version REFERENCES portal.capturadinamica_tp_encuestaversion(IdVersion),
    NumEmpleado     VARCHAR(20)          NULL,     -- se guarda aunque sea anónima para controlar "una respuesta por usuario"
    NombreEmpleado  NVARCHAR(150)        NULL,
    Puesto          NVARCHAR(150)        NULL,
    Cencos          VARCHAR(20)          NULL,
    FechaRespuesta  DATETIME             NOT NULL DEFAULT(GETDATE())
);
GO
CREATE INDEX IX_cd_respuesta_usuario ON portal.capturadinamica_tp_respuestaencuesta (IdVersion, NumEmpleado);
GO

-- Valor capturado por pregunta (QuestionResponse) - una fila por valor
CREATE TABLE portal.capturadinamica_tp_respuestapregunta (
    IdRespuestaPregunta BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_respuestapregunta PRIMARY KEY,
    IdRespuesta         BIGINT               NOT NULL CONSTRAINT FK_cd_resppreg_respuesta REFERENCES portal.capturadinamica_tp_respuestaencuesta(IdRespuesta),
    ClavePregunta       VARCHAR(40)          NOT NULL,
    ClaveOpcion         VARCHAR(40)          NULL,   -- opción / columna de matriz / opción dependiente / '__otro'
    ClaveFila           VARCHAR(40)          NULL,   -- fila de matriz
    ValorTexto          NVARCHAR(MAX)        NULL,   -- texto libre o texto de "Otro"
    ValorNumero         DECIMAL(18,4)        NULL,   -- número o escala
    ValorFecha          DATE                 NULL
);
GO
CREATE INDEX IX_cd_resppreg_respuesta ON portal.capturadinamica_tp_respuestapregunta (IdRespuesta);
CREATE INDEX IX_cd_resppreg_pregunta ON portal.capturadinamica_tp_respuestapregunta (ClavePregunta, ClaveOpcion) INCLUDE (ClaveFila, ValorNumero);
GO

/* =====================================================================
   DATOS DE CATÁLOGOS
   ===================================================================== */
INSERT INTO portal.capturadinamica_tc_menu (Nombre, Controlador, Accion, Icono, Orden) VALUES
 (N'Administrador de encuestas', 'CapturasDinamicas', 'Administrador', 'bi-ui-checks', 1);

INSERT INTO portal.capturadinamica_tc_estatus (IdEstatus, Clave, Descripcion) VALUES
 (1, 'Borrador',  N'En edición, no visible para usuarios'),
 (2, 'Publicada', N'Disponible para responder'),
 (3, 'Cerrada',   N'Ya no recibe respuestas'),
 (4, 'Archivada', N'Histórico');

INSERT INTO portal.capturadinamica_tc_tipopregunta (IdTipoPregunta, Clave, Nombre, Descripcion, Icono, UsaOpciones, PermiteOtro) VALUES
 (1,  'unica',       N'Opción única',               N'Una sola respuesta',                 'bi-ui-radios',         1, 1),
 (2,  'multiple',    N'Selección múltiple',         N'Varias respuestas',                  'bi-ui-checks',         1, 1),
 (3,  'texto',       N'Texto libre',                N'Respuesta abierta',                  'bi-input-cursor-text', 0, 0),
 (4,  'sino',        N'Sí / No',                    N'Respuesta binaria',                  'bi-toggle-on',         1, 0),
 (5,  'escala',      N'Escala',                     N'Valoración numérica (1 a 5, 1 a 10)','bi-sliders',           0, 0),
 (6,  'fecha',       N'Fecha',                      N'Selector de fecha',                  'bi-calendar-event',    0, 0),
 (7,  'numero',      N'Número',                     N'Solo valores numéricos',             'bi-123',               0, 0),
 (8,  'desplegable', N'Desplegable',                N'Lista de opciones',                  'bi-menu-button-wide',  1, 0),
 (9,  'matriz',      N'Matriz',                     N'Filas evaluadas con la misma escala','bi-grid-3x3',          0, 0),
 (10, 'dependiente', N'Multiselección dependiente', N'Listas encadenadas por niveles',     'bi-diagram-3',         0, 0);

INSERT INTO portal.capturadinamica_tc_accionregla (IdAccion, Clave, Nombre, RequiereDestino) VALUES
 (1, 'mostrar',   N'Mostrar pregunta',   1),
 (2, 'ocultar',   N'Ocultar pregunta',   1),
 (3, 'irA',       N'Ir a pregunta',      1),
 (4, 'finalizar', N'Finalizar encuesta', 0);

INSERT INTO portal.capturadinamica_tc_operador (IdOperador, Clave, Nombre) VALUES
 (1, 'igual',    N'Es igual a'),
 (2, 'distinto', N'Es distinto de'),
 (3, 'contiene', N'Incluye / contiene'),
 (4, 'mayor',    N'Es mayor que'),
 (5, 'menor',    N'Es menor que');

INSERT INTO portal.capturadinamica_tc_tiposegmento (IdTipoSegmento, Clave, Nombre) VALUES
 (1, 'Puesto',   N'Puesto'),
 (2, 'Segmento', N'Segmento'),
 (3, 'Region',   N'Región'),
 (4, 'Sucursal', N'Sucursal'),
 (5, 'Usuario',  N'Usuario específico');
GO

/* =====================================================================
   CONSULTAS DE REFERENCIA PARA RESULTADOS
   (para implementar ObtenerResultados en el repositorio SQL)
   ===================================================================== */

-- Conteo por opción (opción única / múltiple / desplegable / sí-no) de una versión
-- DECLARE @IdVersion INT = 1, @ClavePregunta VARCHAR(40) = 'p1';
-- SELECT o.Clave, o.Texto, COUNT(rp.IdRespuestaPregunta) AS Conteo
-- FROM portal.capturadinamica_tp_pregunta p
-- JOIN portal.capturadinamica_tp_preguntaopcion o ON o.IdPregunta = p.IdPregunta AND o.TipoOpcion = 'O'
-- LEFT JOIN portal.capturadinamica_tp_respuestaencuesta re ON re.IdVersion = p.IdVersion
-- LEFT JOIN portal.capturadinamica_tp_respuestapregunta rp ON rp.IdRespuesta = re.IdRespuesta
--        AND rp.ClavePregunta = p.Clave AND rp.ClaveOpcion = o.Clave
-- WHERE p.IdVersion = @IdVersion AND p.Clave = @ClavePregunta
-- GROUP BY o.Clave, o.Texto, o.Orden
-- ORDER BY o.Orden;

-- Matriz: conteo por fila y columna
-- SELECT rp.ClaveFila, rp.ClaveOpcion, COUNT(*) AS Conteo
-- FROM portal.capturadinamica_tp_respuestaencuesta re
-- JOIN portal.capturadinamica_tp_respuestapregunta rp ON rp.IdRespuesta = re.IdRespuesta
-- WHERE re.IdVersion = @IdVersion AND rp.ClavePregunta = @ClavePregunta
-- GROUP BY rp.ClaveFila, rp.ClaveOpcion;

-- ¿El usuario ya respondió? (una respuesta por usuario)
-- SELECT COUNT(*) FROM portal.capturadinamica_tp_respuestaencuesta WHERE IdVersion = @IdVersion AND NumEmpleado = @NumEmpleado;
