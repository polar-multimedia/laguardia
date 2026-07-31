/**
 * Máquina de estados del avatar de Clara.
 *
 * Estados:
 *   idle      — esperando que el usuario hable
 *   listening — detectando voz del usuario (VAD activo)
 *   thinking  — procesando (voz recibida, esperando respuesta)
 *   speaking  — Clara está hablando (audio TTS reproduciéndose)
 */
import { useState, useCallback } from 'react';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function useAvatarState() {
  const [state, setState] = useState<AvatarState>('idle');

  const setIdle = useCallback(() => setState('idle'), []);
  const setListening = useCallback(() => setState('listening'), []);
  const setThinking = useCallback(() => setState('thinking'), []);
  const setSpeaking = useCallback(() => setState('speaking'), []);

  return { state, setIdle, setListening, setThinking, setSpeaking };
}
