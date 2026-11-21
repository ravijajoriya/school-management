import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AnnouncementItem,
  ClassItem,
  ContactMessageItem,
  ContactMessageStatus,
  CreateAnnouncementInput,
  CreateEnquiryInput,
  CreateEventInput,
  CreateFollowUpInput,
  CreateNoticeInput,
  EnquiryAssignee,
  EnquiryDetail,
  EnquiryListItem,
  EnquirySummary,
  EventItem,
  ListAnnouncementsQuery,
  ListContactMessagesQuery,
  ListEnquiriesQuery,
  ListEventsQuery,
  ListMediaQuery,
  MediaItem,
  NoticeItem,
  PageKey,
  Paginated,
  UpdateAnnouncementInput,
  UpdateEnquiryInput,
  UpdateEventInput,
  UpdateMediaInput,
  UpdateNoticeInput,
  WebsitePageItem,
} from '@school/shared';
import { apiClient } from '@/lib/api-client';

const clean = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null),
  );

/** After CMS changes, refresh both the admin lists and the cached public pages. */
function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => {
    keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    qc.invalidateQueries({ queryKey: ['public'] });
  };
}

// --- Website pages ------------------------------------------------------------------------

export function useWebsitePages() {
  return useQuery({
    queryKey: ['website-pages'],
    queryFn: async () => (await apiClient.get<WebsitePageItem[]>('/website-pages')).data,
  });
}

export function useWebsitePage<K extends PageKey>(key: K) {
  return useQuery({
    queryKey: ['website-pages', key],
    queryFn: async () => (await apiClient.get<WebsitePageItem<K>>(`/website-pages/${key}`)).data,
  });
}

export function useSavePage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ key, content }: { key: PageKey; content: unknown }) =>
      (await apiClient.put<WebsitePageItem>(`/website-pages/${key}`, { content })).data,
    onSuccess: () => invalidate('website-pages'),
  });
}

export function usePublishPage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (key: PageKey) =>
      (await apiClient.post<WebsitePageItem>(`/website-pages/${key}/publish`)).data,
    onSuccess: () => invalidate('website-pages'),
  });
}

// --- Announcements -------------------------------------------------------------------------

export function useAnnouncements(query: Partial<ListAnnouncementsQuery>) {
  return useQuery({
    queryKey: ['announcements', query],
    queryFn: async () =>
      (await apiClient.get<Paginated<AnnouncementItem>>('/announcements', { params: clean(query) }))
        .data,
    placeholderData: keepPreviousData,
  });
}

export function useSaveAnnouncement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: (CreateAnnouncementInput | UpdateAnnouncementInput) & { id?: string }) =>
      id
        ? (await apiClient.patch<AnnouncementItem>(`/announcements/${id}`, input)).data
        : (await apiClient.post<AnnouncementItem>('/announcements', input)).data,
    onSuccess: () => invalidate('announcements'),
  });
}

export function useDeleteAnnouncement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/announcements/${id}`),
    onSuccess: () => invalidate('announcements'),
  });
}

// --- Events ---------------------------------------------------------------------------------

export function useEvents(query: Partial<ListEventsQuery>) {
  return useQuery({
    queryKey: ['events', query],
    queryFn: async () =>
      (await apiClient.get<Paginated<EventItem>>('/events', { params: clean(query) })).data,
    placeholderData: keepPreviousData,
  });
}

export function useSaveEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: (CreateEventInput | UpdateEventInput) & { id?: string }) =>
      id
        ? (await apiClient.patch<EventItem>(`/events/${id}`, input)).data
        : (await apiClient.post<EventItem>('/events', input)).data,
    onSuccess: () => invalidate('events'),
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/events/${id}`),
    onSuccess: () => invalidate('events'),
  });
}

// --- Media -----------------------------------------------------------------------------------

export function useMedia(query: Partial<ListMediaQuery>, enabled = true) {
  return useQuery({
    queryKey: ['media', query],
    queryFn: async () =>
      (await apiClient.get<Paginated<MediaItem>>('/media', { params: clean(query) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useUploadMedia() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      file,
      category,
      isPublic,
    }: {
      file: File;
      category: string;
      isPublic: boolean;
    }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('category', category);
      form.append('isPublic', String(isPublic));
      return (
        await apiClient.post<MediaItem>('/media', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    },
    onSuccess: () => invalidate('media'),
  });
}

export function useUpdateMedia() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateMediaInput & { id: string }) =>
      (await apiClient.patch<MediaItem>(`/media/${id}`, input)).data,
    onSuccess: () => invalidate('media'),
  });
}

export function useDeleteMedia() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/media/${id}`),
    onSuccess: () => invalidate('media'),
  });
}

// --- Notices ----------------------------------------------------------------------------------

export function useNotices(page: number, pageSize = 20) {
  return useQuery({
    queryKey: ['notices', page, pageSize],
    queryFn: async () =>
      (await apiClient.get<Paginated<NoticeItem>>('/notices', { params: { page, pageSize } })).data,
    placeholderData: keepPreviousData,
  });
}

export function useNoticeFeed() {
  return useQuery({
    queryKey: ['notices', 'feed'],
    queryFn: async () => (await apiClient.get<NoticeItem[]>('/notices/feed')).data,
  });
}

export function useSaveNotice() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: (CreateNoticeInput | UpdateNoticeInput) & { id?: string }) =>
      id
        ? (await apiClient.patch<NoticeItem>(`/notices/${id}`, input)).data
        : (await apiClient.post<NoticeItem>('/notices', input)).data,
    onSuccess: () => invalidate('notices'),
  });
}

export function useDeleteNotice() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/notices/${id}`),
    onSuccess: () => invalidate('notices'),
  });
}

// --- Enquiries ---------------------------------------------------------------------------------

export function useClasses() {
  return useQuery({
    queryKey: ['classes'],
    queryFn: async () => (await apiClient.get<ClassItem[]>('/classes')).data,
    staleTime: 5 * 60_000,
  });
}

export function useEnquiries(query: Partial<ListEnquiriesQuery>) {
  return useQuery({
    queryKey: ['enquiries', query],
    queryFn: async () =>
      (await apiClient.get<Paginated<EnquiryListItem>>('/enquiries', { params: clean(query) }))
        .data,
    placeholderData: keepPreviousData,
  });
}

export function useEnquiry(id: string) {
  return useQuery({
    queryKey: ['enquiries', 'detail', id],
    queryFn: async () => (await apiClient.get<EnquiryDetail>(`/enquiries/${id}`)).data,
  });
}

export function useEnquirySummary(enabled = true) {
  return useQuery({
    queryKey: ['enquiries', 'summary'],
    queryFn: async () => (await apiClient.get<EnquirySummary>('/enquiries/summary')).data,
    enabled,
  });
}

export function useEnquiryAssignees() {
  return useQuery({
    queryKey: ['enquiries', 'assignees'],
    queryFn: async () => (await apiClient.get<EnquiryAssignee[]>('/enquiries/assignees')).data,
    staleTime: 5 * 60_000,
  });
}

export function useCreateEnquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEnquiryInput) =>
      (await apiClient.post<EnquiryDetail>('/enquiries', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['enquiries'] }),
  });
}

export function useUpdateEnquiry(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateEnquiryInput) =>
      (await apiClient.patch<EnquiryDetail>(`/enquiries/${id}`, input)).data,
    onSuccess: (data) => {
      qc.setQueryData(['enquiries', 'detail', id], data);
      qc.invalidateQueries({
        queryKey: ['enquiries'],
        predicate: (q) => q.queryKey[1] !== 'detail',
      });
    },
  });
}

export function useAddFollowUp(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateFollowUpInput) =>
      (await apiClient.post<EnquiryDetail>(`/enquiries/${id}/follow-ups`, input)).data,
    onSuccess: (data) => {
      qc.setQueryData(['enquiries', 'detail', id], data);
      qc.invalidateQueries({
        queryKey: ['enquiries'],
        predicate: (q) => q.queryKey[1] !== 'detail',
      });
    },
  });
}

// --- Contact messages ----------------------------------------------------------------------------

export function useContactMessages(query: Partial<ListContactMessagesQuery>) {
  return useQuery({
    queryKey: ['contact-messages', query],
    queryFn: async () =>
      (
        await apiClient.get<Paginated<ContactMessageItem>>('/contact-messages', {
          params: clean(query),
        })
      ).data,
    placeholderData: keepPreviousData,
  });
}

export function useUnreadMessages(enabled = true) {
  return useQuery({
    queryKey: ['contact-messages', 'unread'],
    queryFn: async () =>
      (await apiClient.get<{ count: number }>('/contact-messages/unread-count')).data.count,
    enabled,
  });
}

export function useUpdateContactMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ContactMessageStatus }) =>
      (await apiClient.patch<ContactMessageItem>(`/contact-messages/${id}`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-messages'] }),
  });
}
