// Dữ liệu server.ts gửi xuống qua SSE. Dùng chung cho mọi game.

export interface LiveStatus {
  isConnected: boolean;
  isConnecting: boolean;
  username: string;
  roomId: string;
  viewerCount: number;
  totalLikes: number;
  error?: string;
  bridge?: boolean; // chạy trong MyStudioLive: app giữ kết nối TikTok
}

export interface ChatEvent {
  username: string;
  nickname: string;
  comment: string;
  avatar: string;
  timestamp: number;
}

export interface GiftEvent {
  username: string;
  nickname: string;
  giftName: string;
  giftId: number;
  diamondCount: number; // xu của 1 món
  repeatCount: number; // số món MỚI trong lần này (server đã trừ phần combo cũ)
  avatar: string;
  timestamp: number;
}

export interface UserEvent {
  username: string;
  nickname: string;
  avatar: string;
  timestamp: number;
}

export interface LikeEvent {
  username: string;
  nickname: string;
  likeCount: number;
  totalLikes: number; // tổng tim cả phòng
}

export interface ControlCommand {
  action: 'speak' | 'setRate' | 'reset' | 'setName' | 'custom';
  text?: string;
}

export interface LiveHandlers {
  onStatus?: (s: LiveStatus) => void;
  onChat?: (e: ChatEvent) => void;
  onGift?: (e: GiftEvent) => void;
  onMember?: (e: UserEvent) => void; // người mới vào phòng
  onFollow?: (e: UserEvent) => void;
  onShare?: (e: UserEvent) => void;
  onLike?: (e: LikeEvent) => void;
  onViewers?: (count: number) => void;
  onControl?: (c: ControlCommand) => void;
  onSpeaker?: (d: { id: string | null; count: number }) => void; // trang stage nào đang được phát tiếng
}
