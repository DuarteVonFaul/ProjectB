"""
Sintetiza várias falas de uma vez com o Piper (um único processo; cada voz é carregada uma vez).

Entrada (stdin, JSON): [{"texto": "...", "modelo": "caminho/voz.onnx", "saida": "caminho/arquivo.wav", "velocidade": 1.0}, ...]
Saída (stdout): uma linha JSON por item: {"saida": "...", "ms": duração em milissegundos} ou {"saida": "...", "erro": "..."}
"""
import json
import sys
import wave

from piper import PiperVoice, SynthesisConfig

sys.stdout.reconfigure(encoding="utf-8")
itens = json.loads(sys.stdin.buffer.read().decode("utf-8"))
vozes = {}

for item in itens:
    try:
        modelo = item["modelo"]
        if modelo not in vozes:
            vozes[modelo] = PiperVoice.load(modelo)
        voz = vozes[modelo]
        # length_scale maior = fala mais lenta; "velocidade" 1.2 = 20% mais rápida.
        config = SynthesisConfig(length_scale=1.0 / max(0.5, min(2.0, float(item.get("velocidade", 1.0)))))
        with wave.open(item["saida"], "wb") as wav:
            voz.synthesize_wav(item["texto"], wav, syn_config=config)
        with wave.open(item["saida"], "rb") as wav:
            ms = round(wav.getnframes() * 1000 / wav.getframerate())
        print(json.dumps({"saida": item["saida"], "ms": ms}), flush=True)
    except Exception as e:  # uma fala com problema não derruba as outras
        print(json.dumps({"saida": item.get("saida"), "erro": str(e)}), flush=True)
