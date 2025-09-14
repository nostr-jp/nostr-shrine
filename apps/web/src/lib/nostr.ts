import { 
  generateSecretKey, 
  getPublicKey, 
  finalizeEvent, 
  verifyEvent,
  getEventHash,
  type Event as NostrEvent,
  type UnsignedEvent
} from 'nostr-tools';

// NIP-07 Window interface
declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: UnsignedEvent): Promise<NostrEvent>;
      getRelays?(): Promise<Record<string, {read: boolean, write: boolean}>>;
      nip04?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
    };
  }
}

// おみくじの結果型
export interface OmikujiResult {
  fortune: 'daikichi' | 'chukichi' | 'shokichi' | 'kichi' | 'suekichi' | 'kyo' | 'daikyo';
  fortuneText: string;
  message: string;
  color: string;
}

// 参拝記録型
export interface WorshipRecord {
  id: string;
  date: string;
  points: number;
  omikuji?: OmikujiResult;
  eventId?: string;
}

// NIP-07 サポートチェック
export function isNip07Available(): boolean {
  return typeof window !== 'undefined' && !!window.nostr;
}

// NIP-07 ログイン
export async function loginWithNip07(): Promise<string> {
  if (!isNip07Available()) {
    throw new Error('NIP-07対応のNostrクライアント（Alby、nos2x等）をインストールしてください');
  }
  
  try {
    const pubkey = await window.nostr!.getPublicKey();
    return pubkey;
  } catch (error) {
    throw new Error('NIP-07ログインに失敗しました。Nostrクライアントで許可してください。');
  }
}

// NIP-07 でイベントに署名
export async function signEventWithNip07(unsignedEvent: UnsignedEvent): Promise<NostrEvent> {
  if (!isNip07Available()) {
    throw new Error('NIP-07対応のNostrクライアントが必要です');
  }
  
  try {
    const signedEvent = await window.nostr!.signEvent(unsignedEvent);
    return signedEvent;
  } catch (error) {
    throw new Error('イベントの署名に失敗しました');
  }
}

// 公開鍵を短縮表示用にフォーマット
export function formatPublicKey(pubkey: string): string {
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
}

// おみくじを引く
export function drawOmikuji(seed?: string): OmikujiResult {
  const fortunes = [
    { 
      fortune: 'daikichi' as const, 
      fortuneText: '大吉', 
      message: '素晴らしい運気に恵まれています。新しいことに挑戦する絶好のタイミングです。',
      color: '#ff6b6b'
    },
    { 
      fortune: 'chukichi' as const, 
      fortuneText: '中吉', 
      message: '良い運気が流れています。努力が実を結ぶでしょう。',
      color: '#4ecdc4'
    },
    { 
      fortune: 'shokichi' as const, 
      fortuneText: '小吉', 
      message: '小さな幸せが訪れそうです。感謝の気持ちを大切に。',
      color: '#45b7d1'
    },
    { 
      fortune: 'kichi' as const, 
      fortuneText: '吉', 
      message: '穏やかな運気です。日々の積み重ねが大切です。',
      color: '#96ceb4'
    },
    { 
      fortune: 'suekichi' as const, 
      fortuneText: '末吉', 
      message: '後半に向けて運気が上昇します。諦めずに続けましょう。',
      color: '#feca57'
    },
    { 
      fortune: 'kyo' as const, 
      fortuneText: '凶', 
      message: '今は慎重に行動しましょう。困難も成長の機会です。',
      color: '#ff9ff3'
    },
    { 
      fortune: 'daikyo' as const, 
      fortuneText: '大凶', 
      message: '試練の時ですが、必ず乗り越えられます。周りの支えに感謝を。',
      color: '#54a0ff'
    }
  ];

  // シードがある場合はそれを使用、なければランダム
  let randomValue: number;
  if (seed) {
    // シードから疑似乱数を生成
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit整数に変換
    }
    randomValue = Math.abs(hash) / 2147483647; // 0-1の範囲に正規化
  } else {
    randomValue = Math.random();
  }

  // 重み付き抽選（大吉は少し出にくく、大凶はかなり出にくく）
  const weights = [0.15, 0.2, 0.2, 0.2, 0.15, 0.08, 0.02]; // 合計1.0
  let cumulativeWeight = 0;
  
  for (let i = 0; i < fortunes.length; i++) {
    cumulativeWeight += weights[i];
    if (randomValue <= cumulativeWeight) {
      return fortunes[i];
    }
  }
  
  return fortunes[3]; // fallback to 吉
}

// 参拝イベントを作成（NIP-07用）
export function createWorshipEventUnsigned(pubkey: string): UnsignedEvent {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  return {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', 'nostr-shrine'],
      ['t', 'worship'],
      ['d', today] // 日付をdタグに設定（1日1回制限用）
    ],
    content: `今日も神社に参拝しました 🙏 #nostr神社 #参拝`,
    pubkey
  };
}

// イベントの署名を検証
export function verifyEventSignature(event: NostrEvent): boolean {
  try {
    return verifyEvent(event);
  } catch {
    return false;
  }
}

// 神社APIにイベントを送信（新しいフォーマット）
export async function sendEventToShrine(event: NostrEvent, relays: string[] = [], shrineUrl: string = ''): Promise<any> {
  const url = shrineUrl || 'http://localhost:8787/wrap';
  
  const requestBody = {
    nostr_event: event,
    relays: relays.length > 0 ? relays : null
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`神社への送信に失敗しました: ${errorData.error || response.status}`);
  }

  return response.json();
}

// 神社の公開鍵を取得
export async function getShrinePublicKey(shrineUrl: string = ''): Promise<string> {
  const url = shrineUrl || 'http://localhost:8787/shrine/pubkey';
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`神社の公開鍵取得に失敗しました: ${response.status}`);
  }

  const data = await response.json();
  return data.pubkey;
}

// 今日の参拝をチェック
export function hasWorshippedToday(pubkey: string): boolean {
  if (typeof window === 'undefined') return false;
  
  const today = new Date().toISOString().split('T')[0];
  const key = `worship-${pubkey}-${today}`;
  return localStorage.getItem(key) !== null;
}

// 今日の参拝を記録
export function recordTodaysWorship(pubkey: string, omikuji: OmikujiResult, points: number): void {
  if (typeof window === 'undefined') return;
  
  const today = new Date().toISOString().split('T')[0];
  const key = `worship-${pubkey}-${today}`;
  
  const record: WorshipRecord = {
    id: crypto.randomUUID(),
    date: today,
    points,
    omikuji
  };
  
  localStorage.setItem(key, JSON.stringify(record));
  
  // 総ポイントも更新
  updateTotalPoints(pubkey, points);
}

// 総ポイントを取得
export function getTotalPoints(pubkey: string): number {
  if (typeof window === 'undefined') return 0;
  
  const key = `total-points-${pubkey}`;
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : 0;
}

// 総ポイントを更新
export function updateTotalPoints(pubkey: string, additionalPoints: number): void {
  if (typeof window === 'undefined') return;
  
  const currentPoints = getTotalPoints(pubkey);
  const newTotal = currentPoints + additionalPoints;
  const key = `total-points-${pubkey}`;
  
  localStorage.setItem(key, newTotal.toString());
}

// SNSシェア用のおみくじを引く（シード付き）
export function drawOmikujiFromShare(shareId: string): OmikujiResult {
  // シェアIDをシードとして使用しておみくじを引く
  return drawOmikuji(shareId);
}

// SNSシェアURL生成
export function generateShareUrls(omikuji: OmikujiResult) {
  const text = `Nostr神社でおみくじを引きました！\n結果: ${omikuji.fortuneText}\n${omikuji.message}\n\n#nostr神社 #おみくじ`;
  const url = window.location.origin;
  
  return {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`,
    line: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
  };
}

// 参拝履歴を取得（簡略版）
export function getWorshipHistory(pubkey: string): WorshipRecord[] {
  if (typeof window === 'undefined') return [];
  
  const records: WorshipRecord[] = [];
  const keys = Object.keys(localStorage);
  
  // worship-{pubkey}-{date} の形式のキーを探す
  const worshipKeys = keys.filter(key => key.startsWith(`worship-${pubkey}-`));
  
  for (const key of worshipKeys) {
    try {
      const record = JSON.parse(localStorage.getItem(key) || '');
      records.push(record);
    } catch {
      // 無効なデータは無視
    }
  }
  
  // 日付順でソート（新しい順）
  return records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// 日時をフォーマット
export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(timestamp));
}

// ポイント計算（運勢によって変動）
export function calculatePoints(omikuji: OmikujiResult): number {
  const basePoints = 10;
  const bonusPoints = {
    'daikichi': 20,
    'chukichi': 15,
    'shokichi': 12,
    'kichi': 10,
    'suekichi': 8,
    'kyo': 5,
    'daikyo': 3
  };
  
  return basePoints + (bonusPoints[omikuji.fortune] || 10);
}
