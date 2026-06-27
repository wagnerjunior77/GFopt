# GFopt

Otimizador local de Special/SP para charts do Guitar Flash.

O programa recebe um chart em JSON/JS, calcula o melhor path estimado de SP,
mostra os combos de ativacao no terminal e pode gerar uma imagem do caminho.

## Requisitos

- Node.js 18 ou superior.
- Dependencias instaladas:

```powershell
npm install
```

`sharp` e usado para gerar PNG. O SVG e gerado pelo `render-path.js`.

## Formato do chart

O arquivo de entrada deve conter um array de notas:

```json
[
  {
    "time": "3.95833",
    "duration": "0.0",
    "track": "0",
    "special": "0"
  }
]
```

Campos:

- `time`: tempo da nota em segundos.
- `duration`: duracao da nota; `0` e nota normal, acima disso e long note.
- `track`: pista/cor da nota.
- `special`: `"1"` quando a nota faz parte de uma frase de SP.

Tracks:

```text
0 = verde
1 = vermelho
2 = amarelo
3 = azul
4 = laranja
```

Notas com o mesmo `time` sao tratadas como acorde. Coloque seus charts locais
em uma pasta fora do Git, por exemplo:

```text
charts\minha-musica.json
```

## Rodar no terminal

No PowerShell, entre na pasta onde voce clonou o projeto e rode:

```powershell
node optimize-sp.js charts\minha-musica.json
```

Ou via npm:

```powershell
npm run optimize -- charts\minha-musica.json
```

Exemplo de saida:

```text
Path: 2-3-2-2-3

1) 2SP: ativar no combo 328-329, termina no combo 410
   tempo: 65.250s -> 72.542s
   cobre 83 bolinhas em 74 eventos, 0 ticks de long, +1660 pontos estimados
```

Quando uma ativacao precisar ser feita no limite, o combo aparece com `(Max)`.
Quando o programa detectar que metade/folga e suficiente, o combo fica sem
essa marcacao.

## Arquivos gerados

Por padrao, o otimizador grava:

```text
output\summary.json
output\sp-path.json
output\grouped-notes.json
output\special-phrases.json
```

Principais arquivos:

- `summary.json`: resumo do score estimado e das ativacoes.
- `sp-path.json`: lista detalhada das ativacoes.
- `grouped-notes.json`: notas agrupadas por tempo, com combo de inicio/fim.
- `special-phrases.json`: frases de SP detectadas.

Para trocar a pasta de saida:

```powershell
node optimize-sp.js charts\minha-musica.json --out output-minha-musica
```

## Gerar imagem

Para gerar a visualizacao do path:

```powershell
node render-path.js charts\minha-musica.json
```

Ou via npm:

```powershell
npm run render -- charts\minha-musica.json
```

Saida:

```text
output\minha-musica\path.svg
output\minha-musica\path.png
```

Tambem da para usar o `.bat`:

```powershell
.\visualizar.bat charts\minha-musica.json
```

Ou arraste um chart em cima de `visualizar.bat`.

## Bats uteis

Simular no terminal:

```powershell
.\simular.bat charts\minha-musica.json
```

Gerar e abrir imagem:

```powershell
.\visualizar.bat charts\minha-musica.json
```

## Opcoes

Trocar a pasta raiz da visualizacao:

```powershell
node render-path.js charts\minha-musica.json --out renders
```

Controlar quantos segundos entram por linha:

```powershell
node render-path.js charts\minha-musica.json --row-seconds 10
```

Aumentar a largura da imagem:

```powershell
node render-path.js charts\minha-musica.json --width 1600
```

Testar outro minimo de sustain:

```powershell
node optimize-sp.js charts\minha-musica.json --sustain-min 0.25
```

Testar outro timing de SP:

```powershell
node optimize-sp.js charts\minha-musica.json --sp-timing 2:7.3:0.125:0.125
```

Formato do `--sp-timing`:

```text
quantidade:duracao:squeeze:force
```

Exemplo: `2:7.3:0.125:0.125` significa 2SP com timer de `7.3s`,
squeeze de `0.125s` e forcada de `0.125s`.

Desligar ativacoes dentro de sustain:

```powershell
node optimize-sp.js charts\minha-musica.json --no-sustain-anchors
```

Desligar ativacao no mesmo combo em que uma frase de SP termina:

```powershell
node optimize-sp.js charts\minha-musica.json --no-phrase-end-activation
```

## Precisao

O scoring considera combo por bolinha, acordes, long notes, sustains sob SP,
ativacao em sustain, squeeze e forcada com janelas calibradas.

Mesmo assim, o resultado e uma simulacao. Use o terminal e a imagem como base
para testar o path no jogo.
