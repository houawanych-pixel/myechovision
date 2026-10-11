# The character brain

The brain writes the character's replies from their persona, the scene and the last
12 messages, and tags each reply with one of five emotions. Turn it on with the
**AI brain** switch in chat. There are two kinds.

## Fast brain (recommended for live talk)

Any service that speaks the OpenAI chat format works: a hosted model, the proxy in
`worker/brain-proxy.js`, or a model running on your own computer.

1. Create an account with a model service (the app lists Groq and OpenRouter) and make a key.
2. In chat, tick **AI brain**, choose the service, paste the key, tap **Check and list models**,
   pick a model, tap **Use this brain**.

The key is stored only in that browser (`localStorage`), never in this repo or in the saved
studio data. That is fine for one person on their own device. Before other people use the
app, deploy `worker/brain-proxy.js` so the key lives on a server, and point the app at it
with **My own server or computer**.

### Your own computer later

Run a model server with an OpenAI-compatible address (for example Ollama) on a computer with
a real graphics card. Two things are needed because the site is HTTPS: the computer must be
reachable at an **https** address (for example through a tunnel), and the server must allow
this site as an origin. Then enter that address under **My own server or computer**.

## On this device (test)

A small model (Llama 3.2 1B or 3B) running in the browser with WebLLM. Free and private,
but slow, weaker at staying in character, and it needs WebGPU.

## Hands-free and predictive answering

**Hands-free talk** sends what you say, speaks the reply, then listens again. With a fast
brain it also prepares an answer while you are still talking: once the heard words pause for
about half a second it asks the brain, and if your final sentence matches, that answer is
used at once. If you said more, it is dropped and a new one is written. She does not talk
over you.
