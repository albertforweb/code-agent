export function isNativeAudioAvailable(): boolean {
  return false;
}

export function isNativeRecordingActive(): boolean {
  return false;
}

export function startNativeRecording(): boolean {
  return false;
}

export function stopNativeRecording(): void {}

export default {
  isNativeAudioAvailable,
  isNativeRecordingActive,
  startNativeRecording,
  stopNativeRecording,
};
