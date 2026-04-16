'use client';
import { useCallback, useState } from 'react';

export function useAvatar() {
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);

  const playVideo = useCallback((url: string) => {
    setCurrentVideoUrl(url);
  }, []);

  const onVideoEnd = useCallback(() => {
    setCurrentVideoUrl(null);
  }, []);

  return { currentVideoUrl, playVideo, onVideoEnd };
}
