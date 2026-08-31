import axios from 'axios';
import { StockData } from '@/types/stock';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

export const fetchScreenerData = async (): Promise<StockData[]> => {
  const response = await axios.get(`${API_BASE_URL}/screener`);
  return response.data;
};
