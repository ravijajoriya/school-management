import { useQuery } from '@tanstack/react-query';
import type {
  ClassItem,
  PageContentMap,
  PageKey,
  PublicAnnouncement,
  PublicContactMessageInput,
  PublicEnquiryInput,
  PublicEnquiryResponse,
  PublicEvent,
  PublicMedia,
} from '@school/shared';
import { apiClient } from './api-client';

/** URL of a public image by id (served by the API, cached by the browser). */
export const mediaUrl = (id: string) => `/api/v1/public/media/${id}`;

const PUBLIC_STALE = 60_000;

export function usePublicPage<K extends PageKey>(key: K) {
  return useQuery({
    queryKey: ['public', 'page', key],
    queryFn: async () => (await apiClient.get<PageContentMap[K]>(`/public/pages/${key}`)).data,
    staleTime: PUBLIC_STALE,
  });
}

export function usePublicAnnouncements(limit = 10) {
  return useQuery({
    queryKey: ['public', 'announcements', limit],
    queryFn: async () =>
      (await apiClient.get<PublicAnnouncement[]>('/public/announcements', { params: { limit } }))
        .data,
    staleTime: PUBLIC_STALE,
  });
}

export function usePublicAnnouncement(slug: string) {
  return useQuery({
    queryKey: ['public', 'announcement', slug],
    queryFn: async () =>
      (await apiClient.get<PublicAnnouncement>(`/public/announcements/${slug}`)).data,
    staleTime: PUBLIC_STALE,
    retry: false,
  });
}

export function usePublicEvents(when: 'upcoming' | 'past', limit = 20) {
  return useQuery({
    queryKey: ['public', 'events', when, limit],
    queryFn: async () =>
      (await apiClient.get<PublicEvent[]>('/public/events', { params: { when, limit } })).data,
    staleTime: PUBLIC_STALE,
  });
}

export function usePublicEvent(slug: string) {
  return useQuery({
    queryKey: ['public', 'event', slug],
    queryFn: async () => (await apiClient.get<PublicEvent>(`/public/events/${slug}`)).data,
    staleTime: PUBLIC_STALE,
    retry: false,
  });
}

export function useGallery(category?: string) {
  return useQuery({
    queryKey: ['public', 'gallery', category ?? 'all'],
    queryFn: async () =>
      (await apiClient.get<PublicMedia[]>('/public/gallery', { params: { category } })).data,
    staleTime: PUBLIC_STALE,
  });
}

export function usePublicClasses() {
  return useQuery({
    queryKey: ['public', 'classes'],
    queryFn: async () => (await apiClient.get<ClassItem[]>('/public/classes')).data,
    staleTime: 5 * 60_000,
  });
}

export async function submitEnquiry(input: PublicEnquiryInput) {
  return (await apiClient.post<PublicEnquiryResponse>('/public/enquiries', input)).data;
}

export async function submitContactMessage(input: PublicContactMessageInput) {
  await apiClient.post('/public/contact-messages', input);
}
