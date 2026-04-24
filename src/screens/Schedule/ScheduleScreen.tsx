import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useScheduleStore } from '@/store/useScheduleStore';
import { useGroupStore } from '@/store/useGroupStore';
import { usePcoStore } from '@/store/usePcoStore';
import { ServiceSchedule, ServiceTemplate, DAYS_OF_WEEK } from '@/types';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '@/config/theme';
import { ScheduleStackParamList } from '@/navigation/ScheduleStackNavigator';

type Nav = NativeStackNavigationProp<ScheduleStackParamList, 'ScheduleHome'>;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
function endOfYear() {
  const d = new Date();
  d.setFullYear(d.getFullYear(), 11, 31);
  d.setHours(23, 59, 59, 999);
  return d;
}
function nextOccurrence(dayOfWeek: number, startTime: string): Date {
  const [h, m] = startTime.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  const diff = (dayOfWeek - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (diff === 0 && d < new Date() ? 7 : diff));
  return d;
}

function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return digits;
}

function to24h(time: string, ampm: 'AM' | 'PM'): string {
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (isNaN(h)) return '09:00';
  if (ampm === 'AM' && h === 12) h = 0;
  if (ampm === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function from24h(time: string): { display: string; ampm: 'AM' | 'PM' } {
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr, 10);
  const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return { display: `${String(h).padStart(2, '0')}:${mStr ?? '00'}`, ampm };
}

function checkinStats(service: ServiceSchedule) {
  const total = service.assignments.length;
  const checkedIn = service.assignments.filter((a) => a.checkIn && !a.checkIn.checkedOutAt).length;
  const noShow = service.assignments.filter((a) => !a.checkIn && new Date(service.serviceDate) < new Date()).length;
  return { total, checkedIn, noShow };
}

type Tab = 'templates' | 'today' | 'upcoming';

export function ScheduleScreen() {
  const navigation = useNavigation<Nav>();
  const { groups, fetchGroups } = useGroupStore();
  const {
    templates, todayServices, upcomingServices, posts, isLoading,
    fetchTemplates, fetchTodayServices, fetchUpcomingServices, fetchPosts,
    createTemplate, updateTemplate, deleteTemplate, generateFromTemplate,
    addRoleSlot, removeRoleSlot, createService, createPost, deletePost,
  } = useScheduleStore();
  const { status: pcoStatus, plans: pcoPlans, isSyncing: pcoSyncing, fetchPlans, fetchStatus: fetchPcoStatus, syncServices } = usePcoStore();
  const pcoConnected = pcoStatus?.connected ?? false;

  const [tab, setTab] = useState<Tab>('today');

  // Create template modal
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplDay, setTplDay] = useState(0); // 0=Sun
  const [tplTime, setTplTime] = useState('09:00');
  const [tplAmPm, setTplAmPm] = useState<'AM' | 'PM'>('AM');
  const [tplDesc, setTplDesc] = useState('');
  const [tplSaving, setTplSaving] = useState(false);

  // Edit template modal
  const [editTemplate, setEditTemplate] = useState<ServiceTemplate | null>(null);
  const [editName, setEditName] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editAmPm, setEditAmPm] = useState<'AM' | 'PM'>('AM');
  const [editDesc, setEditDesc] = useState('');

  // Generate modal
  const [generateTarget, setGenerateTarget] = useState<ServiceTemplate | null>(null);
  const [genEndDate, setGenEndDate] = useState(endOfYear().toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);

  // Role slot modal
  const [slotTarget, setSlotTarget] = useState<ServiceTemplate | null>(null);
  const [slotRole, setSlotRole] = useState('');
  const [slotPostId, setSlotPostId] = useState<string | undefined>();
  const [slotCount, setSlotCount] = useState('1');

  // Create post modal
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postName, setPostName] = useState('');
  const [postZone, setPostZone] = useState('');
  const [postSaving, setPostSaving] = useState(false);

  // Create one-off service
  const [showCreateService, setShowCreateService] = useState(false);
  const [svcName, setSvcName] = useState('');
  const [svcDate, setSvcDate] = useState('');
  const [svcDesc, setSvcDesc] = useState('');
  const [svcSaving, setSvcSaving] = useState(false);

  const isAdmin = groups.some((g) => g.myRole === 'admin');

  useFocusEffect(
    useCallback(() => {
      fetchPcoStatus().then(() => {
        if (usePcoStore.getState().status?.connected) fetchPlans();
      });
      fetchGroups();
      fetchTemplates();
      fetchTodayServices();
      fetchUpcomingServices();
      fetchPosts();
    }, []),
  );

  // ── Template actions ─────────────────────────────────────────────────────

  const handleCreateTemplate = async () => {
    if (!tplName.trim()) return;
    setTplSaving(true);
    try {
      await createTemplate({ name: tplName.trim(), dayOfWeek: tplDay, startTime: to24h(tplTime, tplAmPm), description: tplDesc.trim() || undefined });
      setShowCreateTemplate(false);
      setTplName(''); setTplDesc(''); setTplDay(0); setTplTime('09:00'); setTplAmPm('AM');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create template');
    } finally { setTplSaving(false); }
  };

  const handleSaveEdit = async () => {
    if (!editTemplate) return;
    try {
      await updateTemplate(editTemplate.id, { name: editName.trim(), startTime: to24h(editTime, editAmPm), description: editDesc.trim() || undefined });
      setEditTemplate(null);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
    }
  };

  const handleDeleteTemplate = (t: ServiceTemplate) => {
    Alert.alert('Delete Template', `Delete "${t.name}"? All ${t._count.services} generated services will be unlinked but not deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteTemplate(t.id); }
        catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete'); }
      }},
    ]);
  };

  const handleGenerate = async () => {
    if (!generateTarget) return;
    setGenerating(true);
    try {
      const start = new Date().toISOString();
      const end = new Date(genEndDate + 'T23:59:59').toISOString();
      const { created, skipped } = await generateFromTemplate(generateTarget.id, start, end);
      setGenerateTarget(null);
      Alert.alert('Done', `Created ${created} service${created !== 1 ? 's' : ''}${skipped > 0 ? `, skipped ${skipped} already existing` : ''}.`);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to generate');
    } finally { setGenerating(false); }
  };

  const handleAddSlot = async () => {
    if (!slotTarget || !slotRole.trim()) return;
    try {
      await addRoleSlot(slotTarget.id, { roleName: slotRole.trim(), postId: slotPostId, count: parseInt(slotCount) || 1 });
      setSlotRole(''); setSlotPostId(undefined); setSlotCount('1');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add role');
    }
  };

  const handleRemoveSlot = (templateId: string, slotId: string, roleName: string) => {
    Alert.alert('Remove Role', `Remove "${roleName}" from this template?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeRoleSlot(templateId, slotId) },
    ]);
  };

  const handleCreatePost = async () => {
    if (!postName.trim()) return;
    setPostSaving(true);
    try {
      await createPost({ name: postName.trim(), zone: postZone.trim() || undefined });
      setShowCreatePost(false);
      setPostName(''); setPostZone('');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create post');
    } finally { setPostSaving(false); }
  };

  const handleCreateService = async () => {
    if (!svcName.trim()) return;
    setSvcSaving(true);
    try {
      const parsed = new Date(svcDate || new Date().toISOString());
      const date = isNaN(parsed.getTime()) ? new Date() : parsed;
      const service = await createService({ name: svcName.trim(), serviceDate: date.toISOString(), description: svcDesc.trim() || undefined });
      setShowCreateService(false);
      setSvcName(''); setSvcDate(''); setSvcDesc('');
      navigation.navigate('ServiceDetail', { serviceId: service.id });
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create service');
    } finally { setSvcSaving(false); }
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderServiceCard = (service: ServiceSchedule) => {
    const { total, checkedIn, noShow } = checkinStats(service);
    const started = new Date(service.serviceDate) < new Date();
    return (
      <TouchableOpacity
        key={service.id}
        style={styles.serviceCard}
        onPress={() => navigation.navigate('ServiceDetail', { serviceId: service.id })}
        activeOpacity={0.7}
      >
        <View style={styles.serviceCardLeft}>
          <Text style={styles.serviceTime}>{formatTime(service.serviceDate)}</Text>
          <View style={[styles.dot, started && checkedIn > 0 ? styles.dotGreen : styles.dotGray]} />
        </View>
        <View style={styles.serviceCardBody}>
          <View style={styles.serviceNameRow}>
            <Text style={styles.serviceName} numberOfLines={1}>{service.name}</Text>
            {service.templateId && <View style={styles.recurBadge}><Text style={styles.recurBadgeText}>↻</Text></View>}
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statChip}>👥 {total}</Text>
            <Text style={[styles.statChip, checkedIn > 0 && styles.statGreen]}>✓ {checkedIn}</Text>
            {noShow > 0 && <Text style={[styles.statChip, styles.statRed]}>⚠ {noShow}</Text>}
          </View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  const renderTemplateCard = (t: ServiceTemplate) => {
    const next = nextOccurrence(t.dayOfWeek, t.startTime);
    return (
      <View key={t.id} style={[styles.templateCard, !t.isActive && styles.templateInactive]}>
        <View style={styles.templateHeader}>
          <View style={styles.templateTitleRow}>
            <View style={styles.dayBadge}>
              <Text style={styles.dayBadgeText}>{DAYS_OF_WEEK[t.dayOfWeek].slice(0, 3).toUpperCase()}</Text>
            </View>
            <View style={styles.templateTitleBlock}>
              <Text style={styles.templateName} numberOfLines={1}>{t.name}</Text>
              <Text style={styles.templateTime}>{t.startTime} · {t._count.services} services generated</Text>
            </View>
          </View>
          {isAdmin && (
            <View style={styles.templateActions}>
              <TouchableOpacity style={styles.tplActionBtn} onPress={() => { const { display, ampm } = from24h(t.startTime); setEditTemplate(t); setEditName(t.name); setEditTime(display); setEditAmPm(ampm); setEditDesc(t.description ?? ''); }}>
                <Text style={styles.tplActionText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tplActionBtn, styles.tplActionPrimary]} onPress={() => { setGenerateTarget(t); setGenEndDate(endOfYear().toISOString().slice(0, 10)); }}>
                <Text style={[styles.tplActionText, { color: COLORS.white }]}>Generate</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tplActionBtn} onPress={() => handleDeleteTemplate(t)}>
                <Text style={[styles.tplActionText, { color: COLORS.danger }]}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Next occurrence */}
        <Text style={styles.nextOccurrence}>Next: {next.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })} at {t.startTime}</Text>

        {/* Role slots */}
        {t.roleSlots.length > 0 && (
          <View style={styles.slotsSection}>
            <Text style={styles.slotsLabel}>ROLES NEEDED</Text>
            <View style={styles.slotsRow}>
              {t.roleSlots.map((sl) => (
                <View key={sl.id} style={styles.slotChip}>
                  <Text style={styles.slotChipText}>
                    {sl.count > 1 ? `${sl.count}× ` : ''}{sl.roleName}{sl.post ? ` · ${sl.post.name}` : ''}
                  </Text>
                  {isAdmin && (
                    <TouchableOpacity onPress={() => handleRemoveSlot(t.id, sl.id, sl.roleName)}>
                      <Text style={styles.slotRemove}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {isAdmin && (
                <TouchableOpacity style={[styles.slotChip, styles.slotChipAdd]} onPress={() => setSlotTarget(t)}>
                  <Text style={[styles.slotChipText, { color: COLORS.accent }]}>+ Add Role</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        {t.roleSlots.length === 0 && isAdmin && (
          <TouchableOpacity style={styles.addSlotLink} onPress={() => setSlotTarget(t)}>
            <Text style={styles.addSlotLinkText}>+ Add required roles</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Group upcoming by date
  const grouped = upcomingServices.reduce<Record<string, ServiceSchedule[]>>((acc, svc) => {
    const key = formatDate(svc.serviceDate);
    if (!acc[key]) acc[key] = [];
    acc[key].push(svc);
    return acc;
  }, {});

  // ── PCO view: replaces the custom schedule when connected ──────────────────
  if (pcoConnected) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPlans = pcoPlans.filter((p) => p.sortDate && new Date(p.sortDate) >= today && new Date(p.sortDate) < new Date(today.getTime() + 86400000));
    const upcomingPlans = pcoPlans.filter((p) => p.sortDate && new Date(p.sortDate) > new Date(today.getTime() + 86400000));

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Schedule</Text>
          <TouchableOpacity
            style={[styles.headerBtn, pcoSyncing && { opacity: 0.5 }]}
            onPress={() => syncServices().then(fetchPlans)}
            disabled={pcoSyncing}
          >
            {pcoSyncing
              ? <ActivityIndicator size="small" color={COLORS.accent} />
              : <Text style={styles.headerBtnText}>Sync PCO</Text>
            }
          </TouchableOpacity>
        </View>
        <View style={styles.pcoBanner}>
          <Text style={styles.pcoBannerText}>Powered by Planning Center · {pcoStatus?.pcoOrgName}</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={pcoSyncing} onRefresh={() => syncServices().then(fetchPlans)} tintColor={COLORS.accent} />}
        >
          {todayPlans.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Today</Text>
              {todayPlans.map((p) => (
                <View key={p.id} style={styles.pcoPlanCard}>
                  <View style={styles.pcoPlanLeft}>
                    <Text style={styles.pcoPlanType}>{p.serviceTypeName}</Text>
                    <Text style={styles.pcoPlanTitle}>{p.title ?? p.seriesTitle ?? 'Service'}</Text>
                    {p.sortDate && <Text style={styles.pcoPlanDate}>{new Date(p.sortDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>}
                  </View>
                  {p.totalLength > 0 && <Text style={styles.pcoPlanDur}>{Math.round(p.totalLength / 60)} min</Text>}
                </View>
              ))}
            </>
          )}
          {upcomingPlans.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Upcoming</Text>
              {upcomingPlans.map((p) => (
                <View key={p.id} style={styles.pcoPlanCard}>
                  <View style={styles.pcoPlanLeft}>
                    <Text style={styles.pcoPlanType}>{p.serviceTypeName}</Text>
                    <Text style={styles.pcoPlanTitle}>{p.title ?? p.seriesTitle ?? 'Service'}</Text>
                    {p.sortDate && <Text style={styles.pcoPlanDate}>{new Date(p.sortDate).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</Text>}
                  </View>
                  {p.totalLength > 0 && <Text style={styles.pcoPlanDur}>{Math.round(p.totalLength / 60)} min</Text>}
                </View>
              ))}
            </>
          )}
          {pcoPlans.length === 0 && !pcoSyncing && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No plans synced yet</Text>
              <Text style={styles.emptySubtitle}>{'Tap "Sync PCO" to pull your upcoming services from Planning Center'}</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }
  // ── End PCO view ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
        {isAdmin && (
          <View style={styles.headerBtns}>
            <TouchableOpacity style={styles.headerBtn} onPress={() => setShowCreateService(true)}>
              <Text style={styles.headerBtnText}>+ One-Off</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.headerBtn, styles.headerBtnPrimary]} onPress={() => setShowCreateTemplate(true)}>
              <Text style={[styles.headerBtnText, { color: COLORS.white }]}>+ Recurring</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {(['today', 'upcoming', 'templates'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'templates' ? '↻ Recurring' : t === 'today' ? 'Today' : 'Upcoming'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => { fetchTemplates(); fetchTodayServices(); fetchUpcomingServices(); }}
            tintColor={COLORS.accent}
          />
        }
      >
        {/* TODAY */}
        {tab === 'today' && (
          <>
            <Text style={styles.sectionLabel}>
              {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
            </Text>
            {todayServices.length === 0
              ? <View style={styles.emptyCard}><Text style={styles.emptyText}>No services today</Text></View>
              : todayServices.map(renderServiceCard)
            }
          </>
        )}

        {/* UPCOMING */}
        {tab === 'upcoming' && (
          <>
            {Object.keys(grouped).length === 0
              ? <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No upcoming services</Text>
                  {isAdmin && <Text style={styles.emptyHint}>Create a recurring template and generate, or add a one-off service</Text>}
                </View>
              : Object.entries(grouped).map(([date, services]) => (
                  <View key={date}>
                    <Text style={styles.dateLabel}>{date}</Text>
                    {services.map(renderServiceCard)}
                  </View>
                ))
            }
          </>
        )}

        {/* TEMPLATES */}
        {tab === 'templates' && (
          <>
            <Text style={styles.sectionLabel}>RECURRING TEMPLATES</Text>
            {templates.length === 0
              ? <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No recurring templates</Text>
                  {isAdmin && <Text style={styles.emptyHint}>{'Tap "+ Recurring" to set up a weekly schedule'}</Text>}
                </View>
              : templates.map(renderTemplateCard)
            }

            {/* Posts / Positions */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>POSTS / POSITIONS</Text>
              {isAdmin && (
                <TouchableOpacity onPress={() => setShowCreatePost(true)}>
                  <Text style={styles.sectionAddBtn}>+ New Post</Text>
                </TouchableOpacity>
              )}
            </View>
            {posts.length === 0
              ? <View style={styles.emptyCard}><Text style={styles.emptyText}>No posts defined yet</Text></View>
              : <View style={styles.postsGrid}>
                  {posts.map((p) => (
                    <View key={p.id} style={styles.postChip}>
                      <View>
                        <Text style={styles.postChipName}>{p.name}</Text>
                        {p.zone && <Text style={styles.postChipZone}>{p.zone}</Text>}
                      </View>
                      {isAdmin && (
                        <TouchableOpacity onPress={() => {
                          Alert.alert('Delete Post', `Delete "${p.name}"?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => deletePost(p.id) },
                          ]);
                        }}>
                          <Text style={styles.postChipDelete}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
            }
          </>
        )}
      </ScrollView>

      {/* ── Create template modal ──────────────────────────────────────────── */}
      <Modal visible={showCreateTemplate} transparent animationType="slide" onRequestClose={() => setShowCreateTemplate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>New Recurring Template</Text>

            <TextInput style={styles.input} placeholder="Service name *" placeholderTextColor={COLORS.textMuted}
              value={tplName} onChangeText={setTplName} maxLength={60} />
            <TextInput style={styles.input} placeholder="Description (optional)" placeholderTextColor={COLORS.textMuted}
              value={tplDesc} onChangeText={setTplDesc} maxLength={120} />

            <Text style={styles.fieldLabel}>DAY OF WEEK</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayRow}>
              {DAYS_OF_WEEK.map((day, i) => (
                <TouchableOpacity key={day} style={[styles.dayChip, tplDay === i && styles.dayChipActive]} onPress={() => setTplDay(i)}>
                  <Text style={[styles.dayChipText, tplDay === i && styles.dayChipTextActive]}>{day.slice(0, 3)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>START TIME</Text>
            <TextInput style={styles.input} placeholder="09:00" placeholderTextColor={COLORS.textMuted}
              value={tplTime} onChangeText={(raw) => setTplTime(formatTimeInput(raw))} maxLength={5} keyboardType="numbers-and-punctuation" />
            <View style={styles.ampmRow}>
              {(['AM', 'PM'] as const).map((ap) => (
                <TouchableOpacity key={ap} style={[styles.dayChip, tplAmPm === ap && styles.dayChipActive]} onPress={() => setTplAmPm(ap)}>
                  <Text style={[styles.dayChipText, tplAmPm === ap && styles.dayChipTextActive]}>{ap}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[styles.primaryBtn, (!tplName.trim() || tplSaving) && styles.primaryBtnDisabled]}
              onPress={handleCreateTemplate} disabled={!tplName.trim() || tplSaving}>
              <Text style={styles.primaryBtnText}>{tplSaving ? 'Creating...' : 'Create Template'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowCreateTemplate(false)}>
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Edit template modal ────────────────────────────────────────────── */}
      <Modal visible={!!editTemplate} transparent animationType="slide" onRequestClose={() => setEditTemplate(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Edit Template</Text>
            <TextInput style={styles.input} placeholder="Service name" placeholderTextColor={COLORS.textMuted}
              value={editName} onChangeText={setEditName} maxLength={60} />
            <TextInput style={styles.input} placeholder="Description" placeholderTextColor={COLORS.textMuted}
              value={editDesc} onChangeText={setEditDesc} maxLength={120} />
            <Text style={styles.fieldLabel}>START TIME</Text>
            <TextInput style={styles.input} placeholder="09:00" placeholderTextColor={COLORS.textMuted}
              value={editTime} onChangeText={(raw) => setEditTime(formatTimeInput(raw))} maxLength={5} keyboardType="numbers-and-punctuation" />
            <View style={styles.ampmRow}>
              {(['AM', 'PM'] as const).map((ap) => (
                <TouchableOpacity key={ap} style={[styles.dayChip, editAmPm === ap && styles.dayChipActive]} onPress={() => setEditAmPm(ap)}>
                  <Text style={[styles.dayChipText, editAmPm === ap && styles.dayChipTextActive]}>{ap}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.primaryBtn, !editName.trim() && styles.primaryBtnDisabled]}
              onPress={handleSaveEdit} disabled={!editName.trim()}>
              <Text style={styles.primaryBtnText}>Save Changes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setEditTemplate(null)}>
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Generate modal ─────────────────────────────────────────────────── */}
      <Modal visible={!!generateTarget} transparent animationType="slide" onRequestClose={() => setGenerateTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Generate Services</Text>
            <Text style={styles.generateInfo}>
              Generate a service for every {generateTarget ? DAYS_OF_WEEK[generateTarget.dayOfWeek] : ''} at {generateTarget?.startTime} from today through the end date below.
            </Text>

            <Text style={styles.fieldLabel}>END DATE (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} placeholder="2026-12-31" placeholderTextColor={COLORS.textMuted}
              value={genEndDate} onChangeText={setGenEndDate} maxLength={10} />

            <View style={styles.quickDates}>
              {[
                ['Rest of year', endOfYear().toISOString().slice(0, 10)],
                ['Next month', (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); })()],
                ['Next 3 months', (() => { const d = new Date(); d.setMonth(d.getMonth() + 3); return d.toISOString().slice(0, 10); })()],
              ].map(([label, val]) => (
                <TouchableOpacity key={label} style={styles.quickDateChip} onPress={() => setGenEndDate(val as string)}>
                  <Text style={styles.quickDateText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[styles.primaryBtn, generating && styles.primaryBtnDisabled]}
              onPress={handleGenerate} disabled={generating}>
              <Text style={styles.primaryBtnText}>{generating ? 'Generating...' : `Generate Every ${generateTarget ? DAYS_OF_WEEK[generateTarget.dayOfWeek] : ''}`}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setGenerateTarget(null)}>
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add role slot modal ────────────────────────────────────────────── */}
      <Modal visible={!!slotTarget} transparent animationType="slide" onRequestClose={() => setSlotTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Add Required Role</Text>
            <TextInput style={styles.input} placeholder="Role name * (e.g. Team Lead, Medical)" placeholderTextColor={COLORS.textMuted}
              value={slotRole} onChangeText={setSlotRole} maxLength={40} />
            <Text style={styles.fieldLabel}>POST / LOCATION (OPTIONAL)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayRow}>
              <TouchableOpacity style={[styles.dayChip, !slotPostId && styles.dayChipActive]} onPress={() => setSlotPostId(undefined)}>
                <Text style={[styles.dayChipText, !slotPostId && styles.dayChipTextActive]}>None</Text>
              </TouchableOpacity>
              {posts.map((p) => (
                <TouchableOpacity key={p.id} style={[styles.dayChip, slotPostId === p.id && styles.dayChipActive]} onPress={() => setSlotPostId(p.id)}>
                  <Text style={[styles.dayChipText, slotPostId === p.id && styles.dayChipTextActive]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.fieldLabel}>HOW MANY PEOPLE NEEDED</Text>
            <TextInput style={styles.input} placeholder="1" placeholderTextColor={COLORS.textMuted}
              value={slotCount} onChangeText={setSlotCount} keyboardType="numeric" maxLength={2} />
            <TouchableOpacity style={[styles.primaryBtn, !slotRole.trim() && styles.primaryBtnDisabled]}
              onPress={handleAddSlot} disabled={!slotRole.trim()}>
              <Text style={styles.primaryBtnText}>Add Role</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setSlotTarget(null)}>
              <Text style={styles.ghostBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Create post modal ─────────────────────────────────────────────── */}
      <Modal visible={showCreatePost} transparent animationType="slide" onRequestClose={() => setShowCreatePost(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>New Post / Position</Text>
            <TextInput style={styles.input} placeholder="Post name * (e.g. Front Door, Parking A)" placeholderTextColor={COLORS.textMuted}
              value={postName} onChangeText={setPostName} maxLength={50} />
            <TextInput style={styles.input} placeholder="Zone (optional, e.g. North Lot, Children's Wing)" placeholderTextColor={COLORS.textMuted}
              value={postZone} onChangeText={setPostZone} maxLength={50} />
            <TouchableOpacity style={[styles.primaryBtn, (!postName.trim() || postSaving) && styles.primaryBtnDisabled]}
              onPress={handleCreatePost} disabled={!postName.trim() || postSaving}>
              <Text style={styles.primaryBtnText}>{postSaving ? 'Creating...' : 'Create Post'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowCreatePost(false)}>
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── One-off service modal ──────────────────────────────────────────── */}
      <Modal visible={showCreateService} transparent animationType="slide" onRequestClose={() => setShowCreateService(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Special / One-Off Service</Text>
            <Text style={styles.generateInfo}>For last-minute or non-recurring services (holiday services, special events, etc.)</Text>
            <TextInput style={styles.input} placeholder="Service name *" placeholderTextColor={COLORS.textMuted}
              value={svcName} onChangeText={setSvcName} maxLength={60} />
            <TextInput style={styles.input} placeholder="Description (optional)" placeholderTextColor={COLORS.textMuted}
              value={svcDesc} onChangeText={setSvcDesc} maxLength={120} />
            <Text style={styles.fieldLabel}>DATE & TIME (e.g. 2026-04-20 18:30)</Text>
            <TextInput style={styles.input} placeholder="YYYY-MM-DD HH:MM" placeholderTextColor={COLORS.textMuted}
              value={svcDate} onChangeText={setSvcDate} maxLength={16} />
            <TouchableOpacity style={[styles.primaryBtn, (!svcName.trim() || svcSaving) && styles.primaryBtnDisabled]}
              onPress={handleCreateService} disabled={!svcName.trim() || svcSaving}>
              <Text style={styles.primaryBtnText}>{svcSaving ? 'Creating...' : 'Create Service'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowCreateService(false)}>
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  title: { ...TYPOGRAPHY.heading1, color: COLORS.textPrimary },
  headerBtns: { flexDirection: 'row', gap: SPACING.sm },
  headerBtn: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: 8, borderWidth: 1, borderColor: COLORS.gray700,
  },
  headerBtnPrimary: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  headerBtnText: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, fontWeight: '600' },

  tabBar: { flexDirection: 'row', paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm, gap: SPACING.sm },
  tab: {
    flex: 1, paddingVertical: SPACING.sm, alignItems: 'center',
    borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.surface,
  },
  tabActive: { backgroundColor: COLORS.accent },
  tabText: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, fontWeight: '600' },
  tabTextActive: { color: COLORS.white },

  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  dateLabel: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, fontWeight: '600', marginTop: SPACING.md, marginBottom: SPACING.xs },
  emptyCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.lg, alignItems: 'center', ...SHADOWS.sm },
  emptyText: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
  emptyHint: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: SPACING.xs, textAlign: 'center' },

  // Service cards
  serviceCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.sm,
  },
  serviceCardLeft: { alignItems: 'center', width: 50, marginRight: SPACING.md },
  serviceTime: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  dotGreen: { backgroundColor: COLORS.success },
  dotGray: { backgroundColor: COLORS.gray700 },
  serviceCardBody: { flex: 1 },
  serviceNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  serviceName: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600', flex: 1 },
  recurBadge: { backgroundColor: COLORS.accent + '22', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  recurBadgeText: { ...TYPOGRAPHY.caption, color: COLORS.accent, fontWeight: '700' },
  statRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  statChip: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, backgroundColor: COLORS.gray700, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  statGreen: { color: COLORS.success, backgroundColor: COLORS.success + '22' },
  statRed: { color: COLORS.danger, backgroundColor: COLORS.danger + '22' },
  chevron: { ...TYPOGRAPHY.heading3, color: COLORS.textMuted, marginLeft: SPACING.sm },

  // Template cards
  templateCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.md, ...SHADOWS.sm,
  },
  templateInactive: { opacity: 0.5 },
  templateHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.xs },
  templateTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  dayBadge: {
    backgroundColor: COLORS.accent, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm, minWidth: 44, alignItems: 'center',
  },
  dayBadgeText: { ...TYPOGRAPHY.caption, color: COLORS.white, fontWeight: '800', letterSpacing: 1 },
  templateTitleBlock: { flex: 1 },
  templateName: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '700' },
  templateTime: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 1 },
  templateActions: { flexDirection: 'row', gap: SPACING.xs, marginLeft: SPACING.sm },
  tplActionBtn: {
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: COLORS.gray700,
  },
  tplActionPrimary: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  tplActionText: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, fontWeight: '600' },
  nextOccurrence: { ...TYPOGRAPHY.caption, color: COLORS.info, marginBottom: SPACING.sm },
  slotsSection: { marginTop: SPACING.xs },
  slotsLabel: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, letterSpacing: 1, marginBottom: SPACING.xs },
  slotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  slotChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.background, paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs, borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.gray700,
  },
  slotChipAdd: { borderColor: COLORS.accent, borderStyle: 'dashed' },
  slotChipText: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, fontWeight: '600' },
  slotRemove: { ...TYPOGRAPHY.caption, color: COLORS.danger, marginLeft: 2 },
  addSlotLink: { marginTop: SPACING.xs },
  addSlotLinkText: { ...TYPOGRAPHY.caption, color: COLORS.accent },

  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.lg, paddingBottom: SPACING.xxl,
  },
  sheetTitle: { ...TYPOGRAPHY.heading2, color: COLORS.textPrimary, marginBottom: SPACING.md },
  generateInfo: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginBottom: SPACING.md },
  fieldLabel: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, letterSpacing: 1, marginBottom: SPACING.xs, marginTop: SPACING.sm },
  input: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.gray700, color: COLORS.textPrimary,
    padding: SPACING.md, ...TYPOGRAPHY.body, marginBottom: SPACING.sm,
  },
  dayRow: { marginBottom: SPACING.sm },
  ampmRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  dayChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: COLORS.gray700,
    marginRight: SPACING.sm, backgroundColor: COLORS.background,
  },
  dayChipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '22' },
  dayChipText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, fontWeight: '600' },
  dayChipTextActive: { color: COLORS.accent },
  quickDates: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  quickDateChip: {
    flex: 1, alignItems: 'center', paddingVertical: SPACING.sm,
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.gray700,
  },
  quickDateText: { ...TYPOGRAPHY.caption, color: COLORS.info, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: COLORS.accent, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md + 2, alignItems: 'center', marginTop: SPACING.sm,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { ...TYPOGRAPHY.body, color: COLORS.white, fontWeight: '700' },
  ghostBtn: { alignItems: 'center', paddingVertical: SPACING.md },
  ghostBtnText: { ...TYPOGRAPHY.body, color: COLORS.textMuted },

  // Posts section
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.lg, marginBottom: SPACING.sm },
  sectionAddBtn: { ...TYPOGRAPHY.caption, color: COLORS.accent, fontWeight: '600' },
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  postChip: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.gray700, ...SHADOWS.sm,
  },
  postChipName: { ...TYPOGRAPHY.bodySmall, color: COLORS.textPrimary, fontWeight: '600' },
  postChipZone: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  postChipDelete: { ...TYPOGRAPHY.caption, color: COLORS.danger, fontWeight: '700' },

  // PCO schedule view
  pcoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8410e18',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  pcoBannerText: { ...TYPOGRAPHY.caption, color: '#e8410e', fontWeight: '600' },
  sectionLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  pcoPlanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  pcoPlanLeft: { flex: 1 },
  pcoPlanType: { ...TYPOGRAPHY.caption, color: '#e8410e', fontWeight: '600', marginBottom: 2 },
  pcoPlanTitle: { ...TYPOGRAPHY.body, color: COLORS.textPrimary, fontWeight: '600' },
  pcoPlanDate: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginTop: 2 },
  pcoPlanDur: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, marginLeft: SPACING.md },
  emptyState: { alignItems: 'center', paddingTop: SPACING.xxl },
  emptyTitle: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  emptySubtitle: { ...TYPOGRAPHY.body, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22 },
});
