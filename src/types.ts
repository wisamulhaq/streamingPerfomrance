// types.ts
export interface StreamAPIPerformanceConfig  {
  method: string;
  maxBodyLength?: number;
  url: string;
  headers: Record<string, string>;
  payload?: any;
};