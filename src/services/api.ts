import { PageItem, Bubble } from '../types';

export const fetchImageList = async (): Promise<{ success: boolean; images: PageItem[]; rawDir?: string; outputDir?: string }> => {
  try {
    const res = await fetch('/api/images');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error('Error fetching image list:', error);
    return { success: false, images: [] };
  }
};

export const saveOutputImage = async (filename: string, imageBase64: string): Promise<boolean> => {
  try {
    const res = await fetch('/api/save-output', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, imageBase64 }),
    });
    const data = await res.json();
    return data.success;
  } catch (error) {
    console.error('Error saving output image:', error);
    return false;
  }
};

export const saveProjectMetadata = async (
  filename: string,
  bubbles: Bubble[],
  cleanedImageBase64?: string
): Promise<boolean> => {
  try {
    const metadata = {
      bubbles,
      cleanedImageBase64,
      lastUpdated: new Date().toISOString(),
    };
    const res = await fetch('/api/save-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, metadata }),
    });
    const data = await res.json();
    return data.success;
  } catch (error) {
    console.error('Error saving project metadata:', error);
    return false;
  }
};

export const loadProjectMetadata = async (filename: string): Promise<any> => {
  try {
    const res = await fetch(`/api/project/${encodeURIComponent(filename)}`);
    const data = await res.json();
    return data.metadata;
  } catch (error) {
    console.error('Error loading project metadata:', error);
    return null;
  }
};
