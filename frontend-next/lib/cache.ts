/**
 * localStorage 기반 로컬 캐시 유틸리티
 * 동기화 데이터를 브라우저에 저장하여 API 불안정 시 fallback 제공
 */

interface CacheEntry<T> {
  data: T
  timestamp: number // 저장 시각 (ms)
}

/** 데이터를 localStorage에 캐싱 */
export function setCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() }
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // 용량 초과 시 오래된 캐시 정리 후 재시도
    clearOldCaches()
    try {
      const entry: CacheEntry<T> = { data, timestamp: Date.now() }
      localStorage.setItem(key, JSON.stringify(entry))
    } catch {
      // 그래도 실패하면 무시
    }
  }
}

/** 캐시 데이터 조회 — null이면 캐시 없음 */
export function getCache<T>(key: string): { data: T; timestamp: number; age: string } | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry<T>
    if (!entry.data || !entry.timestamp) return null
    return {
      data: entry.data,
      timestamp: entry.timestamp,
      age: formatAge(Date.now() - entry.timestamp),
    }
  } catch {
    return null
  }
}

/** 특정 캐시 삭제 */
export function clearCache(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // 무시
  }
}

/** 경과 시간 한국어 포맷 */
function formatAge(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return '방금 전'
  const min = Math.floor(sec / 60)
  if (min < 60) return min + '분 전'
  const hr = Math.floor(min / 60)
  if (hr < 24) return hr + '시간 전'
  const day = Math.floor(hr / 24)
  if (day === 1) return '어제'
  return day + '일 전'
}

/** cache: 접두사 키 중 7일 이상 된 것 자동 정리 */
function clearOldCaches(): void {
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
  const now = Date.now()
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith('cache:')) continue
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const entry = JSON.parse(raw) as CacheEntry<unknown>
      if (now - entry.timestamp > SEVEN_DAYS) {
        localStorage.removeItem(key)
      }
    } catch {
      // 파싱 실패한 캐시도 삭제
      if (key) localStorage.removeItem(key)
    }
  }
}
