export type TriageUrgency = 'green' | 'yellow' | 'red';

export interface TriageResult {
  classification: string;
  urgency: TriageUrgency;
  actions: string[];
  referralNeeded: boolean;
  followUp: string;
  reasoning: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: number;
  imagePath?: string;
}

export const URGENCY_CONFIG = {
  green: {
    color: '#2E7D32',
    bgColor: '#E8F5E9',
    label: 'ഇവിടെ ചികിത്സിക്കുക',
    labelEn: 'Treat Locally',
    icon: '✅',
  },
  yellow: {
    color: '#F9A825',
    bgColor: '#FFF8E1',
    label: 'നിരീക്ഷിക്കുക',
    labelEn: 'Monitor',
    icon: '⚠️',
  },
  red: {
    color: '#C62828',
    bgColor: '#FFEBEE',
    label: 'ഉടൻ റഫർ ചെയ്യുക',
    labelEn: 'Refer Immediately',
    icon: '🚨',
  },
} as const;
