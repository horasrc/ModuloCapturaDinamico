/* =====================================================================
   MÓDULO CAPTURA DINÁMICA - Script de base de datos (SQL Server 2012+)

   ► SE PUEDE EJECUTAR VARIAS VECES (idempotente):
       - Cada tabla se crea solo si no existe.
       - Los catálogos solo insertan los registros que falten.
       - Las llaves foráneas e índices se agregan al final; si alguno falla
         se muestra un AVISO y el resto continúa (las tablas quedan creadas).
       - Al final se muestra un resumen de tablas, llaves e índices.

   Antes de ejecutar: selecciona la base correcta (combo de bases de SSMS)
   o descomenta y ajusta la siguiente línea.
   ===================================================================== */
-- USE INT_COMER;
-- GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO

/*
   Nomenclatura:  portal.capturadinamica_<tc|tp>_<accion>
       tc = catálogo     tp = proceso
   Si la base NO distingue mayúsculas (collation _CI_), "portal" usa el esquema
   existente "Portal". Revísalo con:  SELECT DATABASEPROPERTYEX(DB_NAME(), 'Collation');

   Equivalencia con las entidades propuestas:
     Survey           -> capturadinamica_tp_encuesta
     SurveyVersion    -> capturadinamica_tp_encuestaversion
     Question         -> capturadinamica_tp_pregunta
     QuestionType     -> capturadinamica_tc_tipopregunta
     QuestionOption   -> capturadinamica_tp_preguntaopcion
     DependentOption  -> capturadinamica_tp_niveldependiente + capturadinamica_tp_opciondependiente
     ConditionalRule  -> capturadinamica_tp_reglacondicional
     SurveyResponse   -> capturadinamica_tp_respuestaencuesta
     QuestionResponse -> capturadinamica_tp_respuestapregunta
*/

/* =====================================================================
   0. ESQUEMA
   ===================================================================== */
IF SCHEMA_ID('portal') IS NULL
BEGIN
    EXEC('CREATE SCHEMA portal AUTHORIZATION dbo');
    PRINT 'Esquema portal creado.';
END
ELSE PRINT 'Esquema portal ya existe.';
GO

/* =====================================================================
   1. CATÁLOGOS (tc)
   ===================================================================== */
IF OBJECT_ID(N'portal.capturadinamica_tc_menu', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tc_menu (
        IdMenu       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tc_menu PRIMARY KEY,
        Nombre       NVARCHAR(100)     NOT NULL,
        Controlador  VARCHAR(100)      NOT NULL,
        Accion       VARCHAR(100)      NOT NULL,
        Icono        VARCHAR(50)       NULL,
        Orden        INT               NOT NULL CONSTRAINT DF_cd_menu_orden DEFAULT(0),
        Activo       BIT               NOT NULL CONSTRAINT DF_cd_menu_activo DEFAULT(1)
    );
    PRINT 'Creada capturadinamica_tc_menu';
END
GO

IF OBJECT_ID(N'portal.capturadinamica_tc_estatus', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tc_estatus (
        IdEstatus    TINYINT       NOT NULL CONSTRAINT PK_capturadinamica_tc_estatus PRIMARY KEY,
        Clave        VARCHAR(20)   NOT NULL CONSTRAINT UQ_capturadinamica_tc_estatus_Clave UNIQUE,
        Descripcion  NVARCHAR(100) NOT NULL
    );
    PRINT 'Creada capturadinamica_tc_estatus';
END
GO

IF OBJECT_ID(N'portal.capturadinamica_tc_tipopregunta', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tc_tipopregunta (
        IdTipoPregunta TINYINT       NOT NULL CONSTRAINT PK_capturadinamica_tc_tipopregunta PRIMARY KEY,
        Clave          VARCHAR(20)   NOT NULL CONSTRAINT UQ_capturadinamica_tc_tipopregunta_Clave UNIQUE,
        Nombre         NVARCHAR(60)  NOT NULL,
        Descripcion    NVARCHAR(150) NULL,
        Icono          VARCHAR(50)   NULL,
        UsaOpciones    BIT           NOT NULL CONSTRAINT DF_cd_tipo_usaopc DEFAULT(0),
        PermiteOtro    BIT           NOT NULL CONSTRAINT DF_cd_tipo_otro DEFAULT(0),
        Activo         BIT           NOT NULL CONSTRAINT DF_cd_tipo_activo DEFAULT(1)
    );
    PRINT 'Creada capturadinamica_tc_tipopregunta';
END
GO

IF OBJECT_ID(N'portal.capturadinamica_tc_accionregla', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tc_accionregla (
        IdAccion        TINYINT      NOT NULL CONSTRAINT PK_capturadinamica_tc_accionregla PRIMARY KEY,
        Clave           VARCHAR(20)  NOT NULL CONSTRAINT UQ_capturadinamica_tc_accionregla_Clave UNIQUE,
        Nombre          NVARCHAR(60) NOT NULL,
        RequiereDestino BIT          NOT NULL
    );
    PRINT 'Creada capturadinamica_tc_accionregla';
END
GO

IF OBJECT_ID(N'portal.capturadinamica_tc_operador', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tc_operador (
        IdOperador TINYINT      NOT NULL CONSTRAINT PK_capturadinamica_tc_operador PRIMARY KEY,
        Clave      VARCHAR(20)  NOT NULL CONSTRAINT UQ_capturadinamica_tc_operador_Clave UNIQUE,
        Nombre     NVARCHAR(60) NOT NULL
    );
    PRINT 'Creada capturadinamica_tc_operador';
END
GO

IF OBJECT_ID(N'portal.capturadinamica_tc_tiposegmento', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tc_tiposegmento (
        IdTipoSegmento TINYINT      NOT NULL CONSTRAINT PK_capturadinamica_tc_tiposegmento PRIMARY KEY,
        Clave          VARCHAR(20)  NOT NULL CONSTRAINT UQ_capturadinamica_tc_tiposegmento_Clave UNIQUE,
        Nombre         NVARCHAR(60) NOT NULL
    );
    PRINT 'Creada capturadinamica_tc_tiposegmento';
END
GO

/* =====================================================================
   2. PROCESO (tp) - DEFINICIÓN DE ENCUESTAS   (sin llaves foráneas aquí)
   ===================================================================== */
IF OBJECT_ID(N'portal.capturadinamica_tp_encuesta', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tp_encuesta (
        IdEncuesta             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_encuesta PRIMARY KEY,
        Nombre                 NVARCHAR(150) NOT NULL,
        Descripcion            NVARCHAR(300) NULL,
        Activo                 BIT           NOT NULL CONSTRAINT DF_cd_encuesta_activo DEFAULT(1),
        FechaAlta              DATETIME      NOT NULL CONSTRAINT DF_cd_encuesta_alta DEFAULT(GETDATE()),
        NumEmpleadoAlta        VARCHAR(20)   NULL,
        FechaModificacion      DATETIME      NULL,
        NumEmpleadoModifica    VARCHAR(20)   NULL,
        NombreEmpleadoModifica NVARCHAR(150) NULL
    );
    PRINT 'Creada capturadinamica_tp_encuesta';
END
ELSE IF COL_LENGTH(N'portal.capturadinamica_tp_encuesta', N'NombreEmpleadoModifica') IS NULL
BEGIN
    ALTER TABLE portal.capturadinamica_tp_encuesta ADD NombreEmpleadoModifica NVARCHAR(150) NULL;
    PRINT 'Agregada columna NombreEmpleadoModifica';
END
GO

IF OBJECT_ID(N'portal.capturadinamica_tp_encuestaversion', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tp_encuestaversion (
        IdVersion             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_encuestaversion PRIMARY KEY,
        IdEncuesta            INT           NOT NULL,
        NumeroVersion         INT           NOT NULL,
        IdEstatus             TINYINT       NOT NULL,
        FechaInicio           DATE          NULL,
        FechaCierre           DATE          NULL,
        RespuestaUnica        BIT           NOT NULL CONSTRAINT DF_cd_version_unica DEFAULT(1),
        Anonima               BIT           NOT NULL CONSTRAINT DF_cd_version_anonima DEFAULT(0),
        RequiereAutenticacion BIT           NOT NULL CONSTRAINT DF_cd_version_aut DEFAULT(1),
        MensajeInicial        NVARCHAR(500) NULL,
        MensajeFinal          NVARCHAR(500) NULL,
        PoblacionObjetivo     INT           NOT NULL CONSTRAINT DF_cd_version_pob DEFAULT(0),
        FechaAlta             DATETIME      NOT NULL CONSTRAINT DF_cd_version_alta DEFAULT(GETDATE()),
        NumEmpleadoAlta       VARCHAR(20)   NULL,
        NombreEmpleadoAlta    NVARCHAR(150) NULL,
        FechaPublicacion      DATETIME      NULL,
        NumEmpleadoPublica    VARCHAR(20)   NULL,
        CONSTRAINT UQ_cd_version_numero UNIQUE (IdEncuesta, NumeroVersion)
    );
    PRINT 'Creada capturadinamica_tp_encuestaversion';
END
GO

IF OBJECT_ID(N'portal.capturadinamica_tp_segmentacion', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tp_segmentacion (
        IdSegmentacion INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_segmentacion PRIMARY KEY,
        IdVersion      INT           NOT NULL,
        Clave          VARCHAR(40)   NOT NULL,
        IdTipoSegmento TINYINT       NOT NULL,
        Valor          NVARCHAR(100) NOT NULL
    );
    PRINT 'Creada capturadinamica_tp_segmentacion';
END
GO

IF OBJECT_ID(N'portal.capturadinamica_tp_pregunta', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tp_pregunta (
        IdPregunta        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_pregunta PRIMARY KEY,
        IdVersion         INT           NOT NULL,
        Clave             VARCHAR(40)   NOT NULL,      -- estable entre versiones; la usan reglas y respuestas
        Orden             INT           NOT NULL,
        IdTipoPregunta    TINYINT       NOT NULL,
        Texto             NVARCHAR(500) NOT NULL,
        Descripcion       NVARCHAR(300) NULL,
        Obligatoria       BIT           NOT NULL CONSTRAINT DF_cd_preg_obl DEFAULT(0),
        OrdenAleatorio    BIT           NOT NULL CONSTRAINT DF_cd_preg_ale DEFAULT(0),
        PermitirOtro      BIT           NOT NULL CONSTRAINT DF_cd_preg_otro DEFAULT(0),
        TextoLargo        BIT           NOT NULL CONSTRAINT DF_cd_preg_largo DEFAULT(0),
        MinCaracteres     INT           NULL,
        MaxCaracteres     INT           NULL,
        MinSelecciones    INT           NULL,
        MaxSelecciones    INT           NULL,
        ValorMinimo       DECIMAL(18,4) NULL,
        ValorMaximo       DECIMAL(18,4) NULL,
        PermitirDecimales BIT           NOT NULL CONSTRAINT DF_cd_preg_dec DEFAULT(0),
        EscalaMinimo      INT           NULL,
        EscalaMaximo      INT           NULL,
        EtiquetaMinimo    NVARCHAR(40)  NULL,
        EtiquetaMaximo    NVARCHAR(40)  NULL,
        FechaMinima       DATE          NULL,
        FechaMaxima       DATE          NULL,
        CONSTRAINT UQ_cd_pregunta_clave UNIQUE (IdVersion, Clave)
    );
    PRINT 'Creada capturadinamica_tp_pregunta';
END
GO

-- Opciones, filas y columnas de matriz:  TipoOpcion 'O' = opción, 'F' = fila, 'C' = columna
IF OBJECT_ID(N'portal.capturadinamica_tp_preguntaopcion', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tp_preguntaopcion (
        IdOpcion   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_preguntaopcion PRIMARY KEY,
        IdPregunta INT           NOT NULL,
        Clave      VARCHAR(40)   NOT NULL,
        TipoOpcion CHAR(1)       NOT NULL CONSTRAINT CK_cd_opcion_tipo CHECK (TipoOpcion IN ('O','F','C')),
        Texto      NVARCHAR(200) NOT NULL,
        Orden      INT           NOT NULL
    );
    PRINT 'Creada capturadinamica_tp_preguntaopcion';
END
GO

IF OBJECT_ID(N'portal.capturadinamica_tp_niveldependiente', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tp_niveldependiente (
        IdNivel          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_niveldependiente PRIMARY KEY,
        IdPregunta       INT          NOT NULL,
        Nivel            TINYINT      NOT NULL,
        Nombre           NVARCHAR(60) NOT NULL,
        PermitirMultiple BIT          NOT NULL CONSTRAINT DF_cd_nivel_mul DEFAULT(0),
        CONSTRAINT UQ_cd_nivel UNIQUE (IdPregunta, Nivel)
    );
    PRINT 'Creada capturadinamica_tp_niveldependiente';
END
GO

-- ClavePadre apunta a la opción del nivel anterior
IF OBJECT_ID(N'portal.capturadinamica_tp_opciondependiente', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tp_opciondependiente (
        IdOpcionDependiente INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_opciondependiente PRIMARY KEY,
        IdPregunta          INT           NOT NULL,
        Clave               VARCHAR(40)   NOT NULL,
        Nivel               TINYINT       NOT NULL,
        ClavePadre          VARCHAR(40)   NULL,
        Texto               NVARCHAR(120) NOT NULL,
        Orden               INT           NOT NULL
    );
    PRINT 'Creada capturadinamica_tp_opciondependiente';
END
GO

-- SI respuesta <operador> <valor> ENTONCES <accion> <destino>
IF OBJECT_ID(N'portal.capturadinamica_tp_reglacondicional', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tp_reglacondicional (
        IdRegla              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_reglacondicional PRIMARY KEY,
        IdPregunta           INT           NOT NULL,
        Clave                VARCHAR(40)   NOT NULL,
        IdOperador           TINYINT       NOT NULL,
        Valor                NVARCHAR(200) NOT NULL,   -- clave de opción o valor literal
        IdAccion             TINYINT       NOT NULL,
        ClavePreguntaDestino VARCHAR(40)   NULL,       -- NULL cuando la acción es "finalizar"
        Orden                INT           NOT NULL
    );
    PRINT 'Creada capturadinamica_tp_reglacondicional';
END
GO

/* =====================================================================
   3. PROCESO (tp) - RESPUESTAS (modelo dinámico: una fila por valor)
   ===================================================================== */
IF OBJECT_ID(N'portal.capturadinamica_tp_respuestaencuesta', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tp_respuestaencuesta (
        IdRespuesta    BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_respuestaencuesta PRIMARY KEY,
        IdVersion      INT           NOT NULL,
        NumEmpleado    VARCHAR(20)   NULL,   -- se guarda aunque sea anónima (controla una respuesta por usuario)
        NombreEmpleado NVARCHAR(150) NULL,
        Puesto         NVARCHAR(150) NULL,
        Cencos         VARCHAR(20)   NULL,
        FechaRespuesta DATETIME      NOT NULL CONSTRAINT DF_cd_resp_fecha DEFAULT(GETDATE())
    );
    PRINT 'Creada capturadinamica_tp_respuestaencuesta';
END
GO

IF OBJECT_ID(N'portal.capturadinamica_tp_respuestapregunta', N'U') IS NULL
BEGIN
    CREATE TABLE portal.capturadinamica_tp_respuestapregunta (
        IdRespuestaPregunta BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_capturadinamica_tp_respuestapregunta PRIMARY KEY,
        IdRespuesta         BIGINT        NOT NULL,
        ClavePregunta       VARCHAR(40)   NOT NULL,
        ClaveOpcion         VARCHAR(40)   NULL,   -- opción / columna de matriz / opción dependiente / '__otro'
        ClaveFila           VARCHAR(40)   NULL,   -- fila de matriz
        ValorTexto          NVARCHAR(MAX) NULL,
        ValorNumero         DECIMAL(18,4) NULL,
        ValorFecha          DATE          NULL
    );
    PRINT 'Creada capturadinamica_tp_respuestapregunta';
END
GO

/* =====================================================================
   4. LLAVES FORÁNEAS E ÍNDICES
      Se agregan una por una. Si alguna falla se muestra un AVISO y se continúa:
      el módulo funciona aunque falte alguna llave (solo es integridad extra).
   ===================================================================== */
DECLARE @obj TABLE (Orden INT IDENTITY(1,1), Nombre SYSNAME, Tabla SYSNAME, Sentencia NVARCHAR(MAX));
INSERT INTO @obj (Nombre, Tabla, Sentencia) VALUES
 -- Llaves foráneas
 ('FK_cd_version_encuesta',   'capturadinamica_tp_encuestaversion',   'ALTER TABLE portal.capturadinamica_tp_encuestaversion ADD CONSTRAINT FK_cd_version_encuesta FOREIGN KEY (IdEncuesta) REFERENCES portal.capturadinamica_tp_encuesta(IdEncuesta)'),
 ('FK_cd_version_estatus',    'capturadinamica_tp_encuestaversion',   'ALTER TABLE portal.capturadinamica_tp_encuestaversion ADD CONSTRAINT FK_cd_version_estatus FOREIGN KEY (IdEstatus) REFERENCES portal.capturadinamica_tc_estatus(IdEstatus)'),
 ('FK_cd_segmentacion_version','capturadinamica_tp_segmentacion',     'ALTER TABLE portal.capturadinamica_tp_segmentacion ADD CONSTRAINT FK_cd_segmentacion_version FOREIGN KEY (IdVersion) REFERENCES portal.capturadinamica_tp_encuestaversion(IdVersion)'),
 ('FK_cd_segmentacion_tipo',  'capturadinamica_tp_segmentacion',      'ALTER TABLE portal.capturadinamica_tp_segmentacion ADD CONSTRAINT FK_cd_segmentacion_tipo FOREIGN KEY (IdTipoSegmento) REFERENCES portal.capturadinamica_tc_tiposegmento(IdTipoSegmento)'),
 ('FK_cd_pregunta_version',   'capturadinamica_tp_pregunta',          'ALTER TABLE portal.capturadinamica_tp_pregunta ADD CONSTRAINT FK_cd_pregunta_version FOREIGN KEY (IdVersion) REFERENCES portal.capturadinamica_tp_encuestaversion(IdVersion)'),
 ('FK_cd_pregunta_tipo',      'capturadinamica_tp_pregunta',          'ALTER TABLE portal.capturadinamica_tp_pregunta ADD CONSTRAINT FK_cd_pregunta_tipo FOREIGN KEY (IdTipoPregunta) REFERENCES portal.capturadinamica_tc_tipopregunta(IdTipoPregunta)'),
 ('FK_cd_opcion_pregunta',    'capturadinamica_tp_preguntaopcion',    'ALTER TABLE portal.capturadinamica_tp_preguntaopcion ADD CONSTRAINT FK_cd_opcion_pregunta FOREIGN KEY (IdPregunta) REFERENCES portal.capturadinamica_tp_pregunta(IdPregunta)'),
 ('FK_cd_nivel_pregunta',     'capturadinamica_tp_niveldependiente',  'ALTER TABLE portal.capturadinamica_tp_niveldependiente ADD CONSTRAINT FK_cd_nivel_pregunta FOREIGN KEY (IdPregunta) REFERENCES portal.capturadinamica_tp_pregunta(IdPregunta)'),
 ('FK_cd_opdep_pregunta',     'capturadinamica_tp_opciondependiente', 'ALTER TABLE portal.capturadinamica_tp_opciondependiente ADD CONSTRAINT FK_cd_opdep_pregunta FOREIGN KEY (IdPregunta) REFERENCES portal.capturadinamica_tp_pregunta(IdPregunta)'),
 ('FK_cd_regla_pregunta',     'capturadinamica_tp_reglacondicional',  'ALTER TABLE portal.capturadinamica_tp_reglacondicional ADD CONSTRAINT FK_cd_regla_pregunta FOREIGN KEY (IdPregunta) REFERENCES portal.capturadinamica_tp_pregunta(IdPregunta)'),
 ('FK_cd_regla_operador',     'capturadinamica_tp_reglacondicional',  'ALTER TABLE portal.capturadinamica_tp_reglacondicional ADD CONSTRAINT FK_cd_regla_operador FOREIGN KEY (IdOperador) REFERENCES portal.capturadinamica_tc_operador(IdOperador)'),
 ('FK_cd_regla_accion',       'capturadinamica_tp_reglacondicional',  'ALTER TABLE portal.capturadinamica_tp_reglacondicional ADD CONSTRAINT FK_cd_regla_accion FOREIGN KEY (IdAccion) REFERENCES portal.capturadinamica_tc_accionregla(IdAccion)'),
 ('FK_cd_respuesta_version',  'capturadinamica_tp_respuestaencuesta', 'ALTER TABLE portal.capturadinamica_tp_respuestaencuesta ADD CONSTRAINT FK_cd_respuesta_version FOREIGN KEY (IdVersion) REFERENCES portal.capturadinamica_tp_encuestaversion(IdVersion)'),
 ('FK_cd_resppreg_respuesta', 'capturadinamica_tp_respuestapregunta', 'ALTER TABLE portal.capturadinamica_tp_respuestapregunta ADD CONSTRAINT FK_cd_resppreg_respuesta FOREIGN KEY (IdRespuesta) REFERENCES portal.capturadinamica_tp_respuestaencuesta(IdRespuesta)'),
 -- Índices
 ('UX_cd_version_publicada',  'capturadinamica_tp_encuestaversion',   'CREATE UNIQUE INDEX UX_cd_version_publicada ON portal.capturadinamica_tp_encuestaversion (IdEncuesta) WHERE IdEstatus = 2'),
 ('IX_cd_opcion_pregunta',    'capturadinamica_tp_preguntaopcion',    'CREATE INDEX IX_cd_opcion_pregunta ON portal.capturadinamica_tp_preguntaopcion (IdPregunta, TipoOpcion, Orden)'),
 ('IX_cd_opdep_padre',        'capturadinamica_tp_opciondependiente', 'CREATE INDEX IX_cd_opdep_padre ON portal.capturadinamica_tp_opciondependiente (IdPregunta, Nivel, ClavePadre)'),
 ('IX_cd_respuesta_usuario',  'capturadinamica_tp_respuestaencuesta', 'CREATE INDEX IX_cd_respuesta_usuario ON portal.capturadinamica_tp_respuestaencuesta (IdVersion, NumEmpleado)'),
 ('IX_cd_resppreg_respuesta', 'capturadinamica_tp_respuestapregunta', 'CREATE INDEX IX_cd_resppreg_respuesta ON portal.capturadinamica_tp_respuestapregunta (IdRespuesta)'),
 ('IX_cd_resppreg_pregunta',  'capturadinamica_tp_respuestapregunta', 'CREATE INDEX IX_cd_resppreg_pregunta ON portal.capturadinamica_tp_respuestapregunta (ClavePregunta, ClaveOpcion) INCLUDE (ClaveFila, ValorNumero)');

DECLARE @i INT = 1, @max INT, @nombre SYSNAME, @tabla SYSNAME, @sql NVARCHAR(MAX), @idTabla INT;
SELECT @max = MAX(Orden) FROM @obj;
WHILE @i <= @max
BEGIN
    SELECT @nombre = Nombre, @tabla = Tabla, @sql = Sentencia FROM @obj WHERE Orden = @i;
    SET @idTabla = OBJECT_ID(N'portal.' + @tabla, N'U');

    IF @idTabla IS NULL
        PRINT 'AVISO: no existe la tabla ' + @tabla + '; se omite ' + @nombre;
    ELSE IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = @nombre AND parent_object_id = @idTabla)
         OR EXISTS (SELECT 1 FROM sys.indexes WHERE name = @nombre AND object_id = @idTabla)
        PRINT 'Ya existe ' + @nombre;
    ELSE
    BEGIN
        BEGIN TRY
            EXEC sp_executesql @sql;
            PRINT 'Creado ' + @nombre;
        END TRY
        BEGIN CATCH
            PRINT 'AVISO: no se pudo crear ' + @nombre + ' -> ' + ERROR_MESSAGE();
        END CATCH
    END
    SET @i = @i + 1;
END
GO

/* =====================================================================
   5. DATOS DE CATÁLOGOS (solo inserta los que falten)
   ===================================================================== */
INSERT INTO portal.capturadinamica_tc_menu (Nombre, Controlador, Accion, Icono, Orden)
SELECT N'Administrador de encuestas', 'CapturasDinamicas', 'Administrador', 'bi-ui-checks', 1
WHERE NOT EXISTS (SELECT 1 FROM portal.capturadinamica_tc_menu WHERE Controlador = 'CapturasDinamicas' AND Accion = 'Administrador');

INSERT INTO portal.capturadinamica_tc_estatus (IdEstatus, Clave, Descripcion)
SELECT v.Id, v.Clave, v.Descripcion
FROM (VALUES (1, 'Borrador',  N'En edición, no visible para usuarios'),
             (2, 'Publicada', N'Disponible para responder'),
             (3, 'Cerrada',   N'Ya no recibe respuestas'),
             (4, 'Archivada', N'Histórico')) v(Id, Clave, Descripcion)
WHERE NOT EXISTS (SELECT 1 FROM portal.capturadinamica_tc_estatus t WHERE t.IdEstatus = v.Id);

INSERT INTO portal.capturadinamica_tc_tipopregunta (IdTipoPregunta, Clave, Nombre, Descripcion, Icono, UsaOpciones, PermiteOtro)
SELECT v.Id, v.Clave, v.Nombre, v.Descripcion, v.Icono, v.UsaOpciones, v.PermiteOtro
FROM (VALUES (1,  'unica',       N'Opción única',               N'Una sola respuesta',                  'bi-ui-radios',         1, 1),
             (2,  'multiple',    N'Selección múltiple',         N'Varias respuestas',                   'bi-ui-checks',         1, 1),
             (3,  'texto',       N'Texto libre',                N'Respuesta abierta',                   'bi-input-cursor-text', 0, 0),
             (4,  'sino',        N'Sí / No',                    N'Respuesta binaria',                   'bi-toggle-on',         1, 0),
             (5,  'escala',      N'Escala',                     N'Valoración numérica (1 a 5, 1 a 10)', 'bi-sliders',           0, 0),
             (6,  'fecha',       N'Fecha',                      N'Selector de fecha',                   'bi-calendar-event',    0, 0),
             (7,  'numero',      N'Número',                     N'Solo valores numéricos',              'bi-123',               0, 0),
             (8,  'desplegable', N'Desplegable',                N'Lista de opciones',                   'bi-menu-button-wide',  1, 0),
             (9,  'matriz',      N'Matriz',                     N'Filas evaluadas con la misma escala', 'bi-grid-3x3',          0, 0),
             (10, 'dependiente', N'Multiselección dependiente', N'Listas encadenadas por niveles',      'bi-diagram-3',         0, 0)
     ) v(Id, Clave, Nombre, Descripcion, Icono, UsaOpciones, PermiteOtro)
WHERE NOT EXISTS (SELECT 1 FROM portal.capturadinamica_tc_tipopregunta t WHERE t.IdTipoPregunta = v.Id);

INSERT INTO portal.capturadinamica_tc_accionregla (IdAccion, Clave, Nombre, RequiereDestino)
SELECT v.Id, v.Clave, v.Nombre, v.Req
FROM (VALUES (1, 'mostrar',   N'Mostrar pregunta',   1),
             (2, 'ocultar',   N'Ocultar pregunta',   1),
             (3, 'irA',       N'Ir a pregunta',      1),
             (4, 'finalizar', N'Finalizar encuesta', 0)) v(Id, Clave, Nombre, Req)
WHERE NOT EXISTS (SELECT 1 FROM portal.capturadinamica_tc_accionregla t WHERE t.IdAccion = v.Id);

INSERT INTO portal.capturadinamica_tc_operador (IdOperador, Clave, Nombre)
SELECT v.Id, v.Clave, v.Nombre
FROM (VALUES (1, 'igual',    N'Es igual a'),
             (2, 'distinto', N'Es distinto de'),
             (3, 'contiene', N'Incluye / contiene'),
             (4, 'mayor',    N'Es mayor que'),
             (5, 'menor',    N'Es menor que')) v(Id, Clave, Nombre)
WHERE NOT EXISTS (SELECT 1 FROM portal.capturadinamica_tc_operador t WHERE t.IdOperador = v.Id);

INSERT INTO portal.capturadinamica_tc_tiposegmento (IdTipoSegmento, Clave, Nombre)
SELECT v.Id, v.Clave, v.Nombre
FROM (VALUES (1, 'Puesto',   N'Puesto'),
             (2, 'Segmento', N'Segmento'),
             (3, 'Region',   N'Región'),
             (4, 'Sucursal', N'Sucursal'),
             (5, 'Usuario',  N'Usuario específico')) v(Id, Clave, Nombre)
WHERE NOT EXISTS (SELECT 1 FROM portal.capturadinamica_tc_tiposegmento t WHERE t.IdTipoSegmento = v.Id);

PRINT 'Catálogos verificados.';
GO

/* =====================================================================
   6. RESUMEN  (deben salir 16 tablas; FK = 14, índices = 6)
   ===================================================================== */
SELECT  t.name AS Tabla,
        (SELECT COUNT(*) FROM sys.foreign_keys f WHERE f.parent_object_id = t.object_id) AS LlavesForaneas,
        (SELECT COUNT(*) FROM sys.indexes i WHERE i.object_id = t.object_id AND i.name LIKE '[IU]X[_]cd[_]%') AS Indices,
        (SELECT SUM(p.rows) FROM sys.partitions p WHERE p.object_id = t.object_id AND p.index_id IN (0, 1)) AS Filas
FROM sys.tables t
WHERE t.schema_id = SCHEMA_ID('portal') AND t.name LIKE 'capturadinamica[_]%'
ORDER BY t.name;
GO

/* =====================================================================
   CONSULTAS DE REFERENCIA PARA RESULTADOS
   ===================================================================== */
-- Conteo por opción de una pregunta de una versión
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
