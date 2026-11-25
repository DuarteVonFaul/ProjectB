"""
Sintetiza várias falas com o Kokoro (kokoro-onnx), em português do Brasil.

Entrada (stdin, JSON): [{"texto": "...", "voz": "pf_dora", "saida": "arquivo.wav", "velocidade": 1.0}, ...]
Saída (stdout): uma linha JSON por item: {"saida": "...", "ms": duração} ou {"saida": "...", "erro": "..."}
Com o argumento --listar, imprime a lista de vozes do arquivo voices-v1.0.bin.
"""
import json
import os
import sys

from kokoro_onnx import Kokoro
import soundfile as sf

PASTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kokoro")
sys.stdout.reconfigure(encoding="utf-8")
kokoro = Kokoro(os.path.join(PASTA, "kokoro-v1.0.fp16.onnx"), os.path.join(PASTA, "voices-v1.0.bin"))

if "--listar" in sys.argv:
    print(json.dumps(sorted(kokoro.get_voices())))
    sys.exit(0)

itens = json.loads(sys.stdin.buffer.read().decode("utf-8"))
for item in itens:
    try:
        velocidade = max(0.5, min(2.0, float(item.get("velocidade", 1.0))))
        amostras, taxa = kokoro.create(item["texto"], voice=item["voz"], speed=velocidade, lang="pt-br")
        sf.write(item["saida"], amostras, taxa)
        print(json.dumps({"saida": item["saida"], "ms": round(len(amostras) * 1000 / taxa)}), flush=True)
    except Exception as e:  # uma fala com problema não derruba as outras
        print(json.dumps({"saida": item.get("saida"), "erro": str(e)}), flush=True)
