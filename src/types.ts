import { Timestamp } from 'firebase/firestore';

export interface UserSessionData {
  C: string;
  F: string;
  O: string;
  takeaways: string[];
  reflect: string;
  action: string;
  area: string;
  deadline: string;
  updatedAt: Timestamp;
}

export interface SessionInfo {
  day: number;
  id: string;
  title: string;
  speaker: string;
  cat: string;
  reflect: string;
  cfo: string;
}

export interface Area {
  id: string;
  label: string;
}
