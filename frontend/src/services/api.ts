import axios from 'axios';
import { StockData } from '@/types/stock';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://qu-backend-e9qw.onrender.com/api';

export const fetchScreenerData = async (): Promise<StockData[]> => {
  const response = await axios.get(`${API_BASE_URL}/screener`);
  return response.data;
};
