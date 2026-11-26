export interface NativeCatalog {
  value: string;
  name: string;
  initial: string;
  lyrics: boolean;
  albums: boolean;
}

export const NATIVE_SOURCES: Record<
  string,
  {
    name: string;
    initial: string;
    search: (input: { keyword: string; page: number }) => Promise<{
      list: unknown[];
      total: number;
      page: number;
    }>;
    resolve: (input: { songid: string; format: string; time?: number | string }) => Promise<{
      url: string;
      format: string;
      bitrate: string;
      duration: number;
      songid: string;
      sourcePlatform: string;
    }>;
    album:
      | ((input: { id: string; page: number; size: number }) => Promise<unknown>)
      | null;
    lyrics: boolean;
  }
>;

export const NATIVE_CATALOGS: NativeCatalog[];

export function nativeSource(platform: string): (typeof NATIVE_SOURCES)[string] | null;

export function isNativeSource(platform: string): boolean;
