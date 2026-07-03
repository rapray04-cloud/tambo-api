-- =============================================================================
-- 🏪 SISTEMA CONTROL DE INSUMOS TAMBO II - SCRIPT MAESTRO CONSOLIDADO (01-JULIO)
-- =============================================================================

-- 1. Limpieza total de estructuras anteriores para evitar conflictos de memoria
DROP TRIGGER IF EXISTS trigger_actualizar_stock ON public.movimientos;
DROP TRIGGER IF EXISTS tg_actualizar_stock ON public.movimientos;
DROP FUNCTION IF EXISTS public.actualizar_stock_automatico();
DROP TABLE IF EXISTS public.movimientos CASCADE;
DROP TABLE IF EXISTS public.stock_local CASCADE;
DROP TABLE IF EXISTS public.usuarios CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP TABLE IF EXISTS public.insumos CASCADE;
DROP TABLE IF EXISTS public.locales CASCADE;

-- 2. Creación de Tablas Maestras
CREATE TABLE public.locales (
    id_local SERIAL PRIMARY KEY,
    nombre_local VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE public.roles (
    id_rol SERIAL PRIMARY KEY,
    nombre_rol VARCHAR(20) NOT NULL UNIQUE
);

CREATE TABLE public.insumos (
    id_insumo SERIAL PRIMARY KEY,
    codigo_producto VARCHAR(50) UNIQUE,
    nombre_producto VARCHAR(150) NOT NULL,
    maneja_peso BOOLEAN DEFAULT true,
    peso_teorico_kg NUMERIC(10,3) DEFAULT 0.000,
    categoria VARCHAR(50),
    stock_minimo NUMERIC(10,2) DEFAULT 0.00
);

CREATE TABLE public.usuarios (
    id_usuario SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(100) NOT NULL,
    id_rol INTEGER REFERENCES public.roles(id_rol),
    id_local_assigned INTEGER REFERENCES public.locales(id_local)
);

CREATE TABLE public.stock_local (
    id_local INTEGER REFERENCES public.locales(id_local),
    id_insumo INTEGER REFERENCES public.insumos(id_insumo),
    stock_unidades NUMERIC(10,2) DEFAULT 0,
    stock_kilogramos NUMERIC(10,3) DEFAULT 0.000,
    PRIMARY KEY (id_local, id_insumo)
);

CREATE TABLE public.movimientos (
    id_movimiento SERIAL PRIMARY KEY,
    id_usuario INTEGER REFERENCES public.usuarios(id_usuario),
    id_local_origen INTEGER REFERENCES public.locales(id_local),
    id_local_destino INTEGER REFERENCES public.locales(id_local),
    id_insumo INTEGER REFERENCES public.insumos(id_insumo),
    tipo_movimiento VARCHAR(20) NOT NULL, 
    cantidad_unidades NUMERIC(10,2) DEFAULT 0.00,       -- Flexibilizado sin NOT NULL
    cantidad_kilogramos NUMERIC(10,3) DEFAULT 0.000,    -- Flexibilizado sin NOT NULL
    merma_kilogramos NUMERIC(10,3) DEFAULT 0.000,
    precio_total NUMERIC(10,2) DEFAULT 0.00,
    precio_por_kg NUMERIC(10,2) DEFAULT 0.00,
    categoria VARCHAR(50),
    comentario TEXT,
    estado_traslado VARCHAR(20) DEFAULT 'CONFIRMADO', 
    cantidad_recibida_unidades NUMERIC(10,2) DEFAULT NULL,
    fecha_operacion DATE DEFAULT CURRENT_DATE,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Inserción de Datos Maestros Fijos
INSERT INTO public.locales (nombre_local) VALUES 
('Tambo Sebas'), ('Grande Hermanos'), ('Chicken House'), ('Country Club');

INSERT INTO public.roles (nombre_rol) VALUES 
('Administrador'), ('Encargado');

INSERT INTO public.usuarios (username, password_hash, nombre_completo, id_rol, id_local_assigned) VALUES 
('rosario', 'sebas123', 'ROSARIO', 2, 1),
('percy', 'gh123', 'PERCY', 2, 2),
('darvinzon', 'ch123', 'DARVINZON', 2, 3),
('maria', 'cc123', 'MARIA', 2, 4),
('renzo', 'admin2026', 'RENZO RAPRAY', 1, 1);

-- 4. Inserción Completa del Maestro de Insumos (Catálogo Sincronizado con Códigos Únicos)
INSERT INTO public.insumos (codigo_producto, nombre_producto, maneja_peso, peso_teorico_kg, categoria, stock_minimo) VALUES
('HOR-ACE017', 'ACEITE FRITURA 20LT', false, 20.000, 'HORNO', 0.00),
('COC-ACE028', 'ACEITE VEGETAL 20LT', false, 20.000, 'COCINA', 0.00),
('HOR-ADE018', 'ADEREZO DE POLLO', false, 1.000, 'HORNO', 0.00),
('HOR-ADE020', 'ADEREZO ROJO', false, 1.000, 'HORNO', 0.00),
('COC-ALF021', 'ALFREDO (100G)', false, 0.100, 'COCINA', 0.00),
('COC-ALI006', 'ALITAS DE POLLO (PORC. 8 UNID)', false, 0.400, 'COCINA', 0.00),
('HOR-ANT001', 'ANTICUCHO DE CORAZON PALO (140GR)', false, 0.140, 'HORNO', 0.00),
('HOR-BBQ021', 'BBQ', false, 1.000, 'HORNO', 0.00),
('HOR-BIF002', 'BIFE ANGOSTO (270GR-300GR)', false, 0.285, 'HORNO', 0.00),
('HOR-BRO012', 'BROCHETA DE POLLO PALO (130GR - 140GR)', false, 0.135, 'HORNO', 0.00),
('COC-CAB013', 'CABRITO (300GR-400GR)', false, 0.350, 'COCINA', 0.00),
('HOR-CAR015', 'CARBON X 10 KG', false, 10.000, 'HORNO', 0.00),
('COC-CHA008', 'CHAUFA DE CARNE (110G)', false, 0.110, 'COCINA', 0.00),
('COC-CHI011', 'CHICHARRON CHANCHO (250G)', false, 0.250, 'COCINA', 0.00),
('COC-CHI004', 'CHICHARRON POLLO (200GR-250GR)', false, 0.225, 'COCINA', 0.00),
('HOR-CHO005', 'CHORIZO PARRILLERO (100GR)', false, 0.100, 'HORNO', 0.00),
('HOR-CHU006', 'CHULETA DE CERDO (280GR - 300GR)', false, 0.290, 'HORNO', 0.00),
('HOR-CHU003', 'CHURRASCO (280GR - 300GR)', false, 0.290, 'HORNO', 0.00),
('HOR-COS008', 'COSTILLA DE CERDO (460GR - 490GR)', false, 0.475, 'HORNO', 0.00),
('COC-FET022', 'FETTUCCINI (220G)', false, 0.220, 'COCINA', 0.00),
('HOR-FIL011', 'FILETE DE POLLO (240GR - 250GR)', false, 0.245, 'HORNO', 0.00),
('HOR-FRA009', 'FRANKFURTER (24 UND * PQT)(2KG X PQT)', false, 2.000, 'HORNO', 0.00),
('COC-FRE025', 'FREJOL (250G)', false, 0.250, 'COCINA', 0.00),
('COC-JAM024', 'JAMON (40G)', false, 0.040, 'COCINA', 0.00),
('HOR-LEA016', 'LEÑA X 50 KG', false, 50.000, 'HORNO', 0.00),
('HOR-LOM004', 'LOMO FINO (300GR)', false, 0.300, 'HORNO', 0.00),
('COC-LOM007', 'LOMO SALTADO (180GR)', false, 0.180, 'COCINA', 0.00),
('COC-MIX017', 'MIX DE LECHUGA (130G)', false, 0.130, 'COCINA', 0.00),
('HOR-MOL010', 'MOLLEJAS (250GR - 260GR)', false, 0.255, 'HORNO', 0.00),
('COC-NUG014', 'NUGGETS (PORC. 5 UNID)', false, 0.250, 'COCINA', 0.00),
('HOR-PAN007', 'PANCETA (300GR)', false, 0.300, 'HORNO', 0.00),
('COC-PAP018', 'PAPA DE LA CASA', false, 10.000, 'COCINA', 0.00),
('HOR-PAP014', 'PAPA PROCESADA (10 KG)', false, 10.000, 'HORNO', 0.00),
('COC-PAT010', 'PATO PARA ARROZ (PORC. 1/4)', false, 0.350, 'COCINA', 0.00),
('COC-PES020', 'PESTO (60G)', false, 0.060, 'COCINA', 0.00),
('COC-PIE005', 'PIERNA A LA PIMIENTA (250G)', false, 0.250, 'COCINA', 0.00),
('HOR-POL013', 'POLLO B5 (1.40 - 1.60 KG)', false, 1.500, 'HORNO', 0.00),
('COC-POL002', 'POLLO PARA CHAUFA (80GR)', false, 0.080, 'COCINA', 0.00),
('COC-POL001', 'POLLO SALTADO (180GR)', false, 0.180, 'COCINA', 0.00),
('COC-SAL027', 'SALSA HUANCAINA (100G)', false, 0.100, 'COCINA', 0.00),
('COC-SAL026', 'SALSA MADRE (120G)', false, 0.120, 'COCINA', 0.00),
('HOR-SEC019', 'SECRETO', false, 0.200, 'HORNO', 0.00),
('COC-SOP009', 'SOPA DE CARNE (80G)', false, 0.080, 'COCINA', 0.00),
('COC-SOP003', 'SOPA DE POLLO (130GR)', false, 0.130, 'COCINA', 0.00),
('COC-SPA023', 'SPAGUETTI (320G)', false, 0.320, 'COCINA', 0.00),
('COC-TEQ016', 'TEQUEÑOS DE POLLO (PORC. 8 UNID)', false, 0.240, 'COCINA', 0.00),
('COC-TEQ015', 'TEQUEÑOS DE QUESO (PORC. 8 UNID)', false, 0.240, 'COCINA', 0.00),
('COC-TRU012', 'TRUCHA (330GR)', false, 0.330, 'COCINA', 0.00),
('COC-YUC019', 'YUCAS (PORC. 4 UNID)', false, 0.300, 'COCINA', 0.00);

-- 5. Función de Lógica de Negocios Unificada (Manejo de Pesos Teóricos y Precios)
CREATE OR REPLACE FUNCTION public.actualizar_stock_automatico() 
RETURNS trigger AS $$
DECLARE
    v_peso_teorico NUMERIC(10,3);
    v_peso_calculado NUMERIC(10,3);
    v_precio_por_kg NUMERIC(10,2) := 0.00;
BEGIN
    -- A. Obtener el peso teórico asignado en el maestro
    SELECT COALESCE(peso_teorico_kg, 0.000) INTO v_peso_teorico 
    FROM public.insumos 
    WHERE id_insumo = NEW.id_insumo;

    -- B. Inyección Automatizada de Kilos si viaja vacío o en 0
    IF (NEW.cantidad_kilogramos = 0 OR NEW.cantidad_kilogramos IS NULL) AND v_peso_teorico > 0 THEN
        v_peso_calculado := NEW.cantidad_unidades * v_peso_teorico;
        NEW.cantidad_kilogramos := v_peso_calculado; 
    ELSE
        v_peso_calculado := COALESCE(NEW.cantidad_kilogramos, 0.000);
    END IF;

    -- C. Cálculo del Precio por Kilo para Reporte Consolidados
    IF NEW.precio_total > 0 AND v_peso_calculado > 0 THEN
        NEW.precio_por_kg := NEW.precio_total / v_peso_calculado;
    END IF;

    -- D. Flujos e Impacto Directo en Almacenes (stock_local)
    -- INGRESO o RETORNO
    IF NEW.tipo_movimiento IN ('INGRESO', 'RETORNO') THEN
        INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
        VALUES (NEW.id_local_origen, NEW.id_insumo, NEW.cantidad_unidades, v_peso_calculado)
        ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
            stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
            stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;

    -- SALIDA
    ELSIF NEW.tipo_movimiento = 'SALIDA' THEN
        INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
        VALUES (NEW.id_local_origen, NEW.id_insumo, -NEW.cantidad_unidades, -v_peso_calculado)
        ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
            stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
            stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;

    -- PRESTAMO
    ELSIF NEW.tipo_movimiento = 'PRESTAMO' THEN
        INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
        VALUES (NEW.id_local_origen, NEW.id_insumo, -NEW.cantidad_unidades, -v_peso_calculado)
        ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
            stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
            stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;
        
        IF NEW.id_local_destino IS NOT NULL AND NEW.estado_traslado = 'CONFIRMADO' THEN
            INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
            VALUES (NEW.id_local_destino, NEW.id_insumo, NEW.cantidad_unidades, v_peso_calculado)
            ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
                stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
                stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;
        END IF;

    -- DEVOLUCION
    ELSIF NEW.tipo_movimiento = 'DEVOLUCION' THEN
        INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
        VALUES (NEW.id_local_origen, NEW.id_insumo, NEW.cantidad_unidades, v_peso_calculado)
        ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
            stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
            stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;
            
        IF NEW.id_local_destino IS NOT NULL THEN
            INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
            VALUES (NEW.id_local_destino, NEW.id_insumo, -NEW.cantidad_unidades, -v_peso_calculado)
            ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
                stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
                stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Activación del Trigger Único en modo BEFORE
CREATE TRIGGER trigger_actualizar_stock
BEFORE INSERT ON public.movimientos
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_stock_automatico();






-- 1. Cambiamos el nombre de la columna al español para que Node.js la encuentre
ALTER TABLE public.usuarios 
RENAME COLUMN id_local_assigned TO id_local_asignado;

-- 2. Limpiamos las tablas por si quedó algún registro a medias en las pruebas
TRUNCATE TABLE public.movimientos, public.stock_local RESTART IDENTITY CASCADE;

-- 1. Eliminamos el stock mínimo global del catálogo
ALTER TABLE public.insumos DROP COLUMN IF EXISTS stock_minimo;

-- 2. Lo agregamos a la tabla de cada local para que sea independiente
ALTER TABLE public.stock_local ADD COLUMN stock_minimo NUMERIC(10,2) DEFAULT 0.00;



-- Agregamos la columna stock_minimo a la tabla intermedia de los locales
ALTER TABLE public.stock_local ADD COLUMN IF NOT EXISTS stock_minimo NUMERIC(10,2) DEFAULT 0.00;



-- 📦 TABLA MAESTRA DE ÓRDENES DE DESPACHO
CREATE TABLE public.ordenes_despacho (
    id_orden SERIAL PRIMARY KEY,
    id_local_destino INTEGER REFERENCES public.locales(id_local),
    fecha_envio DATE NOT NULL,              -- Fecha en la que se envía el camión (Lunes o Viernes)
    estado_orden VARCHAR(20) DEFAULT 'ENVIADO', -- ENVIADO, RECIBIDO_COMPLETO, RECIBIDO_CON_OBSERVACION
    id_usuario_admin INTEGER REFERENCES public.usuarios(id_usuario), -- Quién aprobó el pedido
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 🥩 DETALLE DE CADA INSUMO EN LA ÓRDEN
CREATE TABLE public.ordenes_despacho_detalle (
    id_detalle SERIAL PRIMARY KEY,
    id_orden INTEGER REFERENCES public.ordenes_despacho(id_orden) ON DELETE CASCADE,
    id_insumo INTEGER REFERENCES public.insumos(id_insumo),
    cantidad_aprobada_admin NUMERIC(10,2) NOT NULL, -- Lo que tú ordenaste que se mande
    cantidad_recibida_local NUMERIC(10,2),          -- Lo que el encargado contó físicamente
    id_usuario_receptor INTEGER REFERENCES public.usuarios(id_usuario), -- Quién contó en el local
    fecha_recepcion TIMESTAMP
);






















