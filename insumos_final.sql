-- =============================================================================
-- 🏪 SISTEMA CONTROL DE INSUMOS TAMBO II - SCRIPT OFICIAL DE BASE DE DATOS (LIMPIO)
-- =============================================================================

-- 1. Limpieza de tablas (Garantiza una instalación limpia)
DROP TABLE IF EXISTS public.movimientos CASCADE;
DROP TABLE IF EXISTS public.stock_local CASCADE;
DROP TABLE IF EXISTS public.usuarios CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP TABLE IF EXISTS public.insumos CASCADE;
DROP TABLE IF EXISTS public.locales CASCADE;

-- 2. Creación de Estructuras de Tabla
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
    categoria VARCHAR(50),
    stock_minimo NUMERIC(10,2) DEFAULT 0.00
);

CREATE TABLE public.usuarios (
    id_usuario SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(100) NOT NULL,
    id_rol INTEGER REFERENCES public.roles(id_rol),
    id_local_asignado INTEGER REFERENCES public.locales(id_local)
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
    tipo_movimiento VARCHAR(20) NOT NULL, -- INGRESO, SALIDA, PRÉSTAMO, DEVOLUCIÓN, RETORNO
    cantidad_unidades NUMERIC(10,2) NOT NULL,
    cantidad_kilogramos NUMERIC(10,3) NOT NULL,
    merma_kilogramos NUMERIC(10,3) DEFAULT 0.000,
    precio_total NUMERIC(10,2) DEFAULT 0.00,
    categoria VARCHAR(50),
    comentario TEXT,
    estado_traslado VARCHAR(20) DEFAULT 'CONFIRMADO', -- PENDIENTE, CONFIRMADO
    cantidad_recibida_unidades NUMERIC(10,2) DEFAULT NULL,
    fecha_operacion DATE DEFAULT CURRENT_DATE,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Inserción de Datos Maestros Básicos
INSERT INTO public.locales (nombre_local) VALUES 
('Tambo Sebas'), 
('Grande Hermanos'), 
('Chicken House'), 
('Country Club');

INSERT INTO public.roles (nombre_rol) VALUES 
('Administrador'), 
('Encargado');

INSERT INTO public.usuarios (username, password_hash, nombre_completo, id_rol, id_local_asignado) VALUES 
('rosario', 'sebas123', 'ROSARIO', 2, 1),
('percy', 'gh123', 'PERCY', 2, 2),
('darvinzon', 'ch123', 'DARVINZON', 2, 3),
('maria', 'cc123', 'MARIA', 2, 4),
('renzo', 'admin2026', 'RENZO RAPRAY', 1, 1);

-- 4. Función de Control Automático y Realimentación Dinámica de Stock Físico
CREATE OR REPLACE FUNCTION public.actualizar_stock_automatico() 
RETURNS trigger AS $$
BEGIN
    -- 🟢 FLUJO DE INGRESO o RETORNO (Suma stock al local de origen)
    IF NEW.tipo_movimiento IN ('INGRESO', 'RETORNO') THEN
        INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
        VALUES (NEW.id_local_origen, NEW.id_insumo, NEW.cantidad_unidades, NEW.cantidad_kilogramos)
        ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
            stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
            stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;

    -- 🔴 FLUJO DE SALIDA (Resta stock al local de origen)
    ELSIF NEW.tipo_movimiento = 'SALIDA' THEN
        INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
        VALUES (NEW.id_local_origen, NEW.id_insumo, -NEW.cantidad_unidades, -NEW.cantidad_kilogramos)
        ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
            stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
            stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;

    -- 🟠 FLUJO DE PRÉSTAMO / TRASLADO (Resta inmediato al origen)
    ELSIF NEW.tipo_movimiento IN ('PRESTAMO', 'PRÉSTAMO') THEN
        -- Resta del origen para congelar el stock en tránsito
        INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
        VALUES (NEW.id_local_origen, NEW.id_insumo, -NEW.cantidad_unidades, -NEW.cantidad_kilogramos)
        ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
            stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
            stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;
        
        -- Si el préstamo nace CONFIRMADO automáticamente por el Admin, suma directo al destino
        IF NEW.estado_traslado = 'CONFIRMADO' AND NEW.id_local_destino IS NOT NULL THEN
            INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
            VALUES (NEW.id_local_destino, NEW.id_insumo, NEW.cantidad_unidades, NEW.cantidad_kilogramos)
            ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
                stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
                stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;
        END IF;

    -- 🔵 FLUJO DE DEVOLUCIÓN TRADICIONAL (Suma al origen y resta al destino)
    ELSIF NEW.tipo_movimiento IN ('DEVOLUCION', 'DEVOLUCIÓN') THEN
        INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
        VALUES (NEW.id_local_origen, NEW.id_insumo, NEW.cantidad_unidades, NEW.cantidad_kilogramos)
        ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
            stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
            stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;
            
        IF NEW.id_local_destino IS NOT NULL THEN
            INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
            VALUES (NEW.id_local_destino, NEW.id_insumo, -NEW.cantidad_unidades, -NEW.cantidad_kilogramos)
            ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
                stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
                stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
selec
-- 5. Creación del Trigger oficial vinculado a movimientos
CREATE TRIGGER tg_actualizar_stock 
AFTER INSERT ON public.movimientos 
FOR EACH ROW 
EXECUTE FUNCTION public.actualizar_stock_automatico();


-- 1. Limpia por completo el historial de auditoría y la tabla calculada de stocks
TRUNCATE TABLE public.movimientos, public.stock_local RESTART IDENTITY CASCADE;

-- 2. Asegura que no queden mermas huérfanas en el contador
ALTER SEQUENCE IF EXISTS public.movimientos_id_movimiento_seq RESTART WITH 1;

ALTER TABLE public.movimientos ALTER COLUMN cantidad_unidades DROP NOT NULL;
ALTER TABLE public.movimientos ALTER COLUMN cantidad_kilogramos DROP NOT NULL;

-- 1. Añadir la columna de peso teórico a la tabla de insumos
ALTER TABLE public.insumos ADD COLUMN peso_teorico_kg NUMERIC(10,3) DEFAULT 0.000;

-- 2. Actualizar la función del trigger para que calcule el peso automáticamente si el insumo no maneja peso directo
CREATE OR REPLACE FUNCTION public.actualizar_stock_automatico() RETURNS trigger AS $$
DECLARE
    v_peso_teorico NUMERIC(10,3);
    v_peso_calculado NUMERIC(10,3);
BEGIN
    -- Obtener el peso teórico del insumo
    SELECT COALESCE(peso_teorico_kg, 0.000) INTO v_peso_teorico 
    FROM public.insumos 
    WHERE id_insumo = NEW.id_insumo;

    -- Si el movimiento no trae kilos pero el insumo tiene peso teórico, lo calculamos
    IF (NEW.cantidad_kilogramos = 0 OR NEW.cantidad_kilogramos IS NULL) AND v_peso_teorico > 0 THEN
        v_peso_calculado := NEW.cantidad_unidades * v_peso_teorico;
        
        -- Actualizamos el registro que se está insertando en movimientos para que guarde el peso calculado
        NEW.cantidad_kilogramos := v_peso_calculado;
    ELSE
        v_peso_calculado := COALESCE(NEW.cantidad_kilogramos, 0.000);
    END IF;

    -- FLUJO DE INGRESO
    IF NEW.tipo_movimiento = 'INGRESO' THEN
        INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
        VALUES (NEW.id_local_origen, NEW.id_insumo, NEW.cantidad_unidades, v_peso_calculado)
        ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
            stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
            stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;

    -- FLUJO DE SALIDA
    ELSIF NEW.tipo_movimiento = 'SALIDA' THEN
        INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
        VALUES (NEW.id_local_origen, NEW.id_insumo, -NEW.cantidad_unidades, -v_peso_calculado)
        ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
            stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
            stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;

    -- FLUJO DE PRÉSTAMO
    ELSIF NEW.tipo_movimiento = 'PRESTAMO' THEN
        -- Resta al origen
        INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
        VALUES (NEW.id_local_origen, NEW.id_insumo, -NEW.cantidad_unidades, -v_peso_calculado)
        ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
            stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
            stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;
        
        -- Suma al destino (Si ya está confirmado)
        IF NEW.id_local_destino IS NOT NULL AND NEW.estado_traslado = 'CONFIRMADO' THEN
            INSERT INTO stock_local (id_local, id_insumo, stock_unidades, stock_kilogramos)
            VALUES (NEW.id_local_destino, NEW.id_insumo, NEW.cantidad_unidades, v_peso_calculado)
            ON CONFLICT (id_local, id_insumo) DO UPDATE SET 
                stock_unidades = stock_local.stock_unidades + EXCLUDED.stock_unidades,
                stock_kilogramos = stock_local.stock_kilogramos + EXCLUDED.stock_kilogramos;
        END IF;

    -- FLUJO DE DEVOLUCIÓN / RETORNO
    ELSIF NEW.tipo_movimiento IN ('DEVOLUCION', 'RETORNO') THEN
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

-- 1. Insumos del Área HORNO
UPDATE public.insumos SET peso_teorico_kg = 20.000, maneja_peso = false WHERE nombre_producto = 'ACEITE FRITURA 20LT';
UPDATE public.insumos SET peso_teorico_kg = 1.000, maneja_peso = false WHERE nombre_producto = 'ADEREZO DE POLLO'; -- Peso referencial por balde de uso
UPDATE public.insumos SET peso_teorico_kg = 1.000, maneja_peso = false WHERE nombre_producto = 'ADEREZO ROJO';
UPDATE public.insumos SET peso_teorico_kg = 0.140, maneja_peso = false WHERE nombre_producto = 'ANTICUCHO DE CORAZON PALO (140GR)';
UPDATE public.insumos SET peso_teorico_kg = 1.000, maneja_peso = false WHERE nombre_producto = 'BBQ';
UPDATE public.insumos SET peso_teorico_kg = 0.285, maneja_peso = false WHERE nombre_producto = 'BIFE ANGOSTO (270GR-300GR)';
UPDATE public.insumos SET peso_teorico_kg = 0.135, maneja_peso = false WHERE nombre_producto = 'BROCHETA DE POLLO PALO (130GR - 140GR)';
UPDATE public.insumos SET peso_teorico_kg = 10.000, maneja_peso = false WHERE nombre_producto = 'CARBON X 10 KG';
UPDATE public.insumos SET peso_teorico_kg = 0.100, maneja_peso = false WHERE nombre_producto = 'CHORIZO PARRILLERO (100GR)';
UPDATE public.insumos SET peso_teorico_kg = 0.290, maneja_peso = false WHERE nombre_producto = 'CHULETA DE CERDO (280GR - 300GR)';
UPDATE public.insumos SET peso_teorico_kg = 0.290, maneja_peso = false WHERE nombre_producto = 'CHURRASCO (280GR - 300GR)';
UPDATE public.insumos SET peso_teorico_kg = 0.475, maneja_peso = false WHERE nombre_producto = 'COSTILLA DE CERDO (460GR - 490GR)';
UPDATE public.insumos SET peso_teorico_kg = 0.245, maneja_peso = false WHERE nombre_producto = 'FILETE DE POLLO (240GR - 250GR)';
UPDATE public.insumos SET peso_teorico_kg = 2.000, maneja_peso = false WHERE nombre_producto = 'FRANKFURTER (24 UND * PQT)(2KG X PQT)';
UPDATE public.insumos SET peso_teorico_kg = 50.000, maneja_peso = false WHERE nombre_producto = 'LEÑA X 50 KG';
UPDATE public.insumos SET peso_teorico_kg = 0.300, maneja_peso = false WHERE nombre_producto = 'LOMO FINO (300GR)';
UPDATE public.insumos SET peso_teorico_kg = 0.255, maneja_peso = false WHERE nombre_producto = 'MOLLEJAS (250GR - 260GR)';
UPDATE public.insumos SET peso_teorico_kg = 0.300, maneja_peso = false WHERE nombre_producto = 'PANCETA (300GR)';
UPDATE public.insumos SET peso_teorico_kg = 10.000, maneja_peso = false WHERE nombre_producto = 'PAPA PROCESADA (10 KG)';
UPDATE public.insumos SET peso_teorico_kg = 1.500, maneja_peso = false WHERE nombre_producto = 'POLLO B5 (1.40 - 1.60 KG)';
UPDATE public.insumos SET peso_teorico_kg = 0.200, maneja_peso = false WHERE nombre_producto = 'SECRETO';

-- 2. Insumos del Área COCINA
UPDATE public.insumos SET peso_teorico_kg = 20.000, maneja_peso = false WHERE nombre_producto = 'ACEITE VEGETAL 20LT';
UPDATE public.insumos SET peso_teorico_kg = 0.100, maneja_peso = false WHERE nombre_producto = 'ALFREDO (100G)';
UPDATE public.insumos SET peso_teorico_kg = 0.400, maneja_peso = false WHERE nombre_producto = 'ALITAS DE POLLO (PORC. 8 UNID)'; -- Peso aprox por porción armada
UPDATE public.insumos SET peso_teorico_kg = 0.350, maneja_peso = false WHERE nombre_producto = 'CABRITO (300GR-400GR)';
UPDATE public.insumos SET peso_teorico_kg = 0.110, maneja_peso = false WHERE nombre_producto = 'CHAUFA DE CARNE (110G)';
UPDATE public.insumos SET peso_teorico_kg = 0.250, maneja_peso = false WHERE nombre_producto = 'CHICHARRON CHANCHO (250G)';
UPDATE public.insumos SET peso_teorico_kg = 0.225, maneja_peso = false WHERE nombre_producto = 'CHICHARRON POLLO (200GR-250GR)';
UPDATE public.insumos SET peso_teorico_kg = 0.220, maneja_peso = false WHERE nombre_producto = 'FETTUCCINI (220G)';
UPDATE public.insumos SET peso_teorico_kg = 0.250, maneja_peso = false WHERE nombre_producto = 'FREJOL (250G)';
UPDATE public.insumos SET peso_teorico_kg = 0.040, maneja_peso = false WHERE nombre_producto = 'JAMON (40G)';
UPDATE public.insumos SET peso_teorico_kg = 0.180, maneja_peso = false WHERE nombre_producto = 'LOMO SALTADO (180GR)';
UPDATE public.insumos SET peso_teorico_kg = 0.130, maneja_peso = false WHERE nombre_producto = 'MIX DE LECHUGA (130G)';
UPDATE public.insumos SET peso_teorico_kg = 0.250, maneja_peso = false WHERE nombre_producto = 'NUGGETS (PORC. 5 UNID)';
UPDATE public.insumos SET peso_teorico_kg = 10.000, maneja_peso = false WHERE nombre_producto = 'PAPA DE LA CASA'; -- Se maneja referencial por caja de 10kg
UPDATE public.insumos SET peso_teorico_kg = 0.350, maneja_peso = false WHERE nombre_producto = 'PATO PARA ARROZ (PORC. 1/4)';
UPDATE public.insumos SET peso_teorico_kg = 0.060, maneja_peso = false WHERE nombre_producto = 'PESTO (60G)';
UPDATE public.insumos SET peso_teorico_kg = 0.250, maneja_peso = false WHERE nombre_producto = 'PIERNA A LA PIMIENTA (250G)';
UPDATE public.insumos SET peso_teorico_kg = 0.080, maneja_peso = false WHERE nombre_producto = 'POLLO PARA CHAUFA (80GR)';
UPDATE public.insumos SET peso_teorico_kg = 0.180, maneja_peso = false WHERE nombre_producto = 'POLLO SALTADO (180GR)';
UPDATE public.insumos SET peso_teorico_kg = 0.100, maneja_peso = false WHERE nombre_producto = 'SALSA HUANCAINA (100G)';
UPDATE public.insumos SET peso_teorico_kg = 0.120, maneja_peso = false WHERE nombre_producto = 'SALSA MADRE (120G)';
UPDATE public.insumos SET peso_teorico_kg = 0.080, maneja_peso = false WHERE nombre_producto = 'SOPA DE CARNE (80G)';
UPDATE public.insumos SET peso_teorico_kg = 0.130, maneja_peso = false WHERE nombre_producto = 'SOPA DE POLLO (130GR)';
UPDATE public.insumos SET peso_teorico_kg = 0.320, maneja_peso = false WHERE nombre_producto = 'SPAGUETTI (320G)';
UPDATE public.insumos SET peso_teorico_kg = 0.240, maneja_peso = false WHERE nombre_producto = 'TEQUEÑOS DE POLLO (PORC. 8 UNID)';
UPDATE public.insumos SET peso_teorico_kg = 0.240, maneja_peso = false WHERE nombre_producto = 'TEQUEÑOS DE QUESO (PORC. 8 UNID)';
UPDATE public.insumos SET peso_teorico_kg = 0.330, maneja_peso = false WHERE nombre_producto = 'TRUCHA (330GR)';
UPDATE public.insumos SET peso_teorico_kg = 0.300, maneja_peso = false WHERE nombre_producto = 'YUCAS (PORC. 4 UNID)';




-- Esto le inyectará los kilos automáticos a tu primer registro en la base de datos
UPDATE public.movimientos 
SET cantidad_kilogramos = cantidad_unidades * 0.285 
WHERE id_movimiento = 1;


-- 1. Eliminamos el trigger viejo para limpiar la memoria de PostgreSQL
DROP TRIGGER IF EXISTS trigger_actualizar_stock ON public.movimientos;

-- 2. Lo volvemos a crear enlazado perfectamente a tu función actualizada
CREATE TRIGGER trigger_actualizar_stock
BEFORE INSERT ON public.movimientos
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_stock_automatico();











