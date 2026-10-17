import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  AudioModule,
  AudioQuality,
  createAudioPlayer,
  getRecordingPermissionsAsync,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import type { RecordedAudio } from '@mawjood/voice-engine';

// The native recorder class, reached exactly the way expo-audio's own
// useAudioRecorder hook reaches it (AudioModule.AudioRecorder). tsc
// verifies the member against the NativeAudioModule type; the eslint
// import/namespace rule cannot model requireNativeModule generics and
// reports it as missing, so that single rule is disabled for this line.
// eslint-disable-next-line import/namespace
const AudioRecorderClass: typeof AudioRecorder = AudioModule.AudioRecorder;

/**
 * Voice-memo preset: 16 kHz mono AAC at 32 kbps.
 * Whisper resamples to 16 kHz internally, so anything above this only costs
 * upload time — a 60 s note is ~240 KB instead of ~1 MB (HIGH_QUALITY).
 */
const VOICE_PRESET: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    extension: '.m4a',
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.LOW,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 32000,
  },
};

/**
 * expo-audio's useAudioRecorder flattens RecordingOptions per platform
 * before constructing the native recorder (its internal
 * `createRecordingOptions` util, which is not exported publicly) — the
 * native AudioRecorder constructor expects exactly this flattened shape
 * (iOS's RecordingOptions record has no nested `ios`/`android`/`web`
 * keys). Mirrored here so the lazily constructed recorder receives
 * identical options to the hook-based one.
 */
function platformRecordingOptions(options: RecordingOptions) {
  const common = {
    extension: options.extension,
    sampleRate: options.sampleRate,
    numberOfChannels: options.numberOfChannels,
    bitRate: options.bitRate,
    isMeteringEnabled: options.isMeteringEnabled ?? false,
  };
  if (Platform.OS === 'ios') {
    return { ...common, directory: options.directory, ...options.ios };
  }
  if (Platform.OS === 'android') {
    return { ...common, directory: options.directory, ...options.android };
  }
  return { ...common, ...options.web };
}

/**
 * Voice recording for Mawjood (expo-audio, SDK 57).
 * VOICE_PRESET → small .m4a file, tuned for Whisper transcription speed.
 *
 * P0-3: the native AudioRecorder is created LAZILY inside the first
 * start() call — never during render or hook initialization. Previously
 * the useAudioRecorder hook constructed the native object on the very
 * first frame, before any user intent to record.
 */
export function useVoiceRecorder() {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);

  const getRecorder = useCallback((): AudioRecorder => {
    if (!recorderRef.current) {
      recorderRef.current = new AudioRecorderClass(
        platformRecordingOptions(VOICE_PRESET),
      );
    }
    return recorderRef.current;
  }, []);

  useEffect(() => {
    getRecordingPermissionsAsync().then((p) => {
      if (p.granted) setPermissionGranted(true);
    });
    return () => {
      if (timer.current) clearInterval(timer.current);
      // mirror useAudioRecorder's auto-release of the shared object on
      // unmount (only if a recording session ever created it)
      recorderRef.current?.release();
      recorderRef.current = null;
    };
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (isRecording) return true;
    try {
      if (!permissionGranted) {
        const res = await requestRecordingPermissionsAsync();
        if (!res.granted) return false;
        setPermissionGranted(true);
      }
      // iOS: the audio session must be switched into a recordable
      // category BEFORE preparing the recorder. Without this call,
      // prepareToRecordAsync throws on iOS and the mic tap used to die
      // silently (no catch, no feedback) — the call existed before the
      // lazy-recorder rewrite (PR #51) and was lost in it.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const recorder = getRecorder();
      await recorder.prepareToRecordAsync();
      recorder.record();
      durationRef.current = 0;
      setDuration(0);
      setIsRecording(true);
      timer.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
      }, 1000);
      return true;
    } catch (e) {
      // Never wedge or fail silently: the caller surfaces recordFail.
      console.warn('recording start failed', e);
      return false;
    }
  }, [isRecording, permissionGranted, getRecorder]);

  const stop = useCallback(async (): Promise<RecordedAudio | null> => {
    if (!isRecording) return null;
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    const recorder = recorderRef.current;
    if (!recorder) {
      setIsRecording(false);
      return null;
    }
    await recorder.stop();
    setIsRecording(false);
    // hand the audio session back to playback so voice replies and TTS
    // play normally (and through the speaker with the ringer silent)
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const uri = recorder.uri;
    if (!uri) return null;
    return {
      uri,
      durationSec: durationRef.current,
      mimeType: 'audio/m4a',
    };
  }, [isRecording]);

  return { isRecording, duration, permissionGranted, start, stop };
}

/**
 * Lazy shared audio player (P0-3) — drop-in replacement for the
 * useAudioPlayer + useAudioPlayerStatus hook pair previously used for
 * voice-note playback in the home screen. The native AudioPlayer is
 * created inside the first replace() call (i.e. the first time the user
 * actually plays a note), never during render.
 *
 * Only the surface the app consumes is exposed: play / pause / replace
 * and the `playing` status flag (fed by the same 'playbackStatusUpdate'
 * event useAudioPlayerStatus subscribes to).
 */
export function useLazyAudioPlayer() {
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);

  const ensurePlayer = useCallback((): AudioPlayer => {
    if (!playerRef.current) {
      // createAudioPlayer(null) with defaults constructs exactly what
      // the useAudioPlayer hook constructed: AudioPlayer(null, 500, false, 0).
      const p = createAudioPlayer(null);
      p.addListener('playbackStatusUpdate', (status) => {
        setPlaying(status.playing);
      });
      playerRef.current = p;
    }
    return playerRef.current;
  }, []);

  const player = useMemo(
    () => ({
      play: () => {
        playerRef.current?.play();
      },
      pause: () => {
        playerRef.current?.pause();
      },
      replace: (source: { uri: string }) => {
        ensurePlayer().replace(source);
      },
    }),
    [ensurePlayer],
  );

  useEffect(
    () => () => {
      // same cleanup the eager pair performed on unmount: the component
      // called player.remove() and the hook auto-released the object.
      playerRef.current?.remove();
      playerRef.current?.release();
      playerRef.current = null;
    },
    [],
  );

  return { player, playing };
}
