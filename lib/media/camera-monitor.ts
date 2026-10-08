export type CameraMonitorResult = { active: boolean; message?: string };

export async function openCameraMonitor(video: HTMLVideoElement): Promise<CameraMonitorResult> {
  if (!("pictureInPictureEnabled" in document) || !document.pictureInPictureEnabled || typeof video.requestPictureInPicture !== "function") {
    return { active: false, message: "Floating camera is unavailable in this browser. Recording will continue with the in-app camera preview." };
  }
  try {
    if (video.paused) await video.play();
    await video.requestPictureInPicture();
    return { active: true };
  } catch {
    return { active: false, message: "Floating camera could not be opened. Recording will continue with the in-app camera preview." };
  }
}

export async function closeCameraMonitor(): Promise<void> {
  if (document.pictureInPictureElement && typeof document.exitPictureInPicture === "function") {
    await document.exitPictureInPicture().catch(() => undefined);
  }
}
