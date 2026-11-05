import { useEffect, useRef } from 'react';
import type { LiveHandlers } from './types';
import { IS_SILENT, IS_STAGE, STAGE_ID, navigateToStudio } from './page';
import { voice } from './voice';

/**
 * Nghe sự kiện live từ server. Handler luôn là bản mới nhất (không lo state cũ),
 * tự kết nối lại khi rớt mạng.
 */
export function useLiveEvents(handlers: LiveHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const on = (name: string, fn: (data: any) => void) =>
      source!.addEventListener(name, (e) => {
        try {
          fn(JSON.parse((e as MessageEvent).data));
        } catch (err) {
          console.warn(`Lỗi xử lý sự kiện ${name}:`, err);
        }
      });

    const connect = () => {
      // khung xem trước im lặng không có STAGE_ID: không giành quyền phát tiếng của trang live thật
      source = new EventSource(STAGE_ID ? `/api/tiktok/events?stage=${STAGE_ID}` : '/api/tiktok/events');
      on('status', (d) => ref.current.onStatus?.(d));
      on('chat', (d) => ref.current.onChat?.(d));
      on('gift', (d) => ref.current.onGift?.(d));
      on('member', (d) => ref.current.onMember?.(d));
      on('follow', (d) => ref.current.onFollow?.(d));
      on('share', (d) => ref.current.onShare?.(d));
      on('like', (d) => ref.current.onLike?.(d));
      on('roomUser', (d) => ref.current.onViewers?.(d.viewerCount));
      on('control', (d) => ref.current.onControl?.(d));
      on('speaker', (d) => {
        // trang stage bị trang mới hơn thay chỗ: im lặng hẳn (cả giọng lẫn nhạc)
        if (IS_STAGE && !IS_SILENT) {
          const mine = d.id === STAGE_ID;
          if (!mine && voice.enabled) voice.stop();
          voice.enabled = mine;
        }
        ref.current.onSpeaker?.(d);
      });
      on('navigate', (d) => navigateToStudio(d.port));
      source.onerror = () => {
        source?.close();
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      source?.close();
    };
  }, []);
}
