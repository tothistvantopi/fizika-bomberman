import { useEffect, useState } from 'react';

/** True on phones and tablets (coarse pointer / touch screen). */
export function useIsTouch(): boolean {
  const query = '(pointer: coarse)';
  const detect = () => window.matchMedia(query).matches || navigator.maxTouchPoints > 0;
  const [isTouch, setIsTouch] = useState(detect);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setIsTouch(detect());
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isTouch;
}
