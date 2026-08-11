export function pcmToDbov(pcm: Float32Array): number {
  if (pcm.length === 0) return -90;
  let s = 0;
  for (let i = 0; i < pcm.length; i++) s += pcm[i] * pcm[i];
  const rms = Math.sqrt(s / pcm.length);
  return rms === 0 ? -90 : 20 * Math.log10(rms);
}
