# NODO 0.1

Prototipo inicial del juego social NODO.

## Qué incluye

- Crear sala con código de 4 dígitos.
- Unirse desde móvil con nombre + código.
- Lista de jugadores conectados.
- Botón de anfitrión para iniciar partida.
- Reparto privado de rol público, facción oculta y objetivo secreto.
- Buzón privado de la IA.
- Eventos globales por ciclo.
- Chat común de sala.

## Requisitos

- Node.js 18 o superior.
- Todos los móviles deben estar en la misma Wi‑Fi que el ordenador que ejecuta el servidor.

## Instalación

Desde la carpeta del proyecto:

```bash
npm run install:all
```

## Ejecutar

```bash
npm run dev
```

Esto levanta:

- Servidor: `http://TU-IP:3001`
- Web del juego: `http://TU-IP:5173`

En el ordenador puedes abrir:

```txt
http://localhost:5173
```

En los móviles, abre la IP local de tu ordenador. Ejemplo:

```txt
http://192.168.1.35:5173
```

## Cómo encontrar tu IP local

Windows:

```bash
ipconfig
```

Busca `Dirección IPv4`.

Mac/Linux:

```bash
ifconfig
```

o:

```bash
ip addr
```

## Flujo de prueba

1. El anfitrión abre la web y pulsa `Crear sala`.
2. Los demás entran con el código.
3. Cuando haya 4–7 jugadores, el anfitrión pulsa `Iniciar partida`.
4. Cada jugador recibe su identidad secreta en el buzón de IA.
5. El anfitrión pulsa `Siguiente ciclo` para disparar protocolos y mensajes privados.

## Próxima versión sugerida

NODO 0.2:

- Reenganchar jugadores si se les cierra el móvil.
- Botón para enviar mensajes anónimos.
- Panel de estrés/confianza/paranoia.
- Temporizador automático por fase.
- Fases: Alerta, Negociación, Transmisión, Operación, Fallo.
