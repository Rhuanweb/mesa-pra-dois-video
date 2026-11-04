# Mesa pra Dois — Reels automático

Todo dia às 00h20 (Brasília) o GitHub Actions:
1. pede o roteiro do dia à função `mesa-video` do Supabase (dados de `mesa_resumo()` + narração da voz Lax no ElevenLabs);
2. abre o site https://mesapradois.vercel.app num Chromium com tempo virtual e grava os quadros (1080×1920, 24 fps);
3. junta narração + música (`bed.wav`) com ffmpeg;
4. sobe o mp4 no bucket `mesa-videos` e marca o vídeo como pronto.

Às 8h o cron `mesa-video-publicar` do Supabase publica o Reels no @mesapradois.3d.

**Testar sem publicar:** Actions → "Reels do dia" → Run workflow (com "Só gerar o vídeo" marcado). O vídeo fica em Artifacts.

Secret necessário no repositório: `MESA_VIDEO_TOKEN` (valor de `video_token` na tabela `mesa_estado`).
