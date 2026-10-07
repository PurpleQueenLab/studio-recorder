export interface BrowserCapabilities {
  secureContext: boolean;
  displayCapture: boolean;
  camera: boolean;
  microphone: boolean;
  mediaRecorder: boolean;
  webCodecs: boolean;
  offscreenCanvas: boolean;
  fileSystemAccess: boolean;
  indexedDb: boolean;
  compatibleRecorderMimeType: string | null;
}

export function detectCapabilities(scope: Window = window): BrowserCapabilities {
  const mediaDevices = scope.navigator.mediaDevices;
  const recorder = typeof MediaRecorder === "undefined" ? undefined : MediaRecorder;
  const mimeTypes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return {
    secureContext: scope.isSecureContext,
    displayCapture: Boolean(mediaDevices?.getDisplayMedia),
    camera: Boolean(mediaDevices?.getUserMedia),
    microphone: Boolean(mediaDevices?.getUserMedia),
    mediaRecorder: Boolean(recorder),
    webCodecs: "VideoEncoder" in scope && "AudioEncoder" in scope,
    offscreenCanvas: "OffscreenCanvas" in scope,
    fileSystemAccess: "showSaveFilePicker" in scope,
    indexedDb: "indexedDB" in scope,
    compatibleRecorderMimeType: recorder
      ? mimeTypes.find((type) => recorder.isTypeSupported(type)) ?? null
      : null,
  };
}
