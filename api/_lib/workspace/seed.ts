import { firestore } from '../config/firebase';
import { defaultSettings } from '../../../shared/workspace';
import { randomBytes } from 'node:crypto';
import { collections } from './schemas';

export async function seedWorkspace(hostId: string) {
  const settingsRef = firestore.collection('workspaceSettings').doc(hostId);
  return firestore.runTransaction(async transaction => {
    const settings = await transaction.get(settingsRef);
    const existing = await transaction.get(firestore.collection('properties').where('hostId', '==', hostId).limit(1));
    if (settings.data()?.sampleLoaded || !existing.empty) return false;
    const now = Date.now();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const day = (offset: number) => { const value = new Date(today + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10); };
    const refs = Object.fromEntries(Object.keys(collections).map(key => [key, Array.from({ length: 8 }, () => firestore.collection(collections[key as keyof typeof collections]).doc())]));
    const add = (resource: keyof typeof collections, index: number, data: Record<string, unknown>) => transaction.set(refs[resource][index], { ...data, hostId, createdAt: now - (8 - index) * 3600000, updatedAt: now });
    const propertyId = (index: number) => refs.properties[index].id;
    const contactId = (index: number) => refs.contacts[index].id;
    [
      { title: 'The Nest · Thảo Điền', address: 'Thảo Điền, TP. Thủ Đức', basePrice: 950000, bedrooms: 1, capacity: 2, description: 'Một khoảng yên giữa lòng thành phố. Căn studio sáng thoáng, ban công xanh và góc bếp riêng.', imageURLs: ['/rooms/maoki-1.jpg'] },
      { title: 'Garden Loft · Quận 1', address: 'Đa Kao, Quận 1', basePrice: 1450000, bedrooms: 2, capacity: 4, description: 'Căn loft hai phòng ngủ, sân vườn riêng và ánh sáng tự nhiên. Dành cho những chuyến đi cùng người thân.', imageURLs: ['/rooms/maoki-2.jpg'] },
      { title: 'Riverside · Bình Thạnh', address: 'Phường 22, Bình Thạnh', basePrice: 1200000, bedrooms: 1, capacity: 2, description: 'Căn hộ bên sông với phòng khách rộng, bếp đầy đủ tiện nghi và góc đọc sách.', imageURLs: ['/rooms/maoki-3.jpg'] },
      { title: 'Little Saigon · Quận 3', address: 'Võ Thị Sáu, Quận 3', basePrice: 850000, bedrooms: 1, capacity: 2, description: 'Không gian nhỏ ấm áp để khám phá nhịp sống Sài Gòn. Thuận tiện di chuyển và tự nhận phòng.', imageURLs: ['/rooms/maoki-4.jpg'] },
    ].forEach((data, index) => add('properties', index, { ...data, status: 'active', published: true }));
    const people = [
      ['Nguyễn Thùy Linh', 'linh@example.test', 'facebook', 'guest', ['Gia đình', 'Khách thân thiết']],
      ['Liam Wilson', 'liam@example.test', 'airbnb', 'guest', ['Quốc tế']],
      ['Trần Minh Anh', 'minhanh@example.test', 'zalo', 'lead', ['Cặp đôi']],
      ['Julia Chen', 'julia@example.test', 'booking', 'returning', ['Khách thân thiết']],
      ['Phạm Hoàng Nam', 'nam@example.test', 'webchat', 'lead', ['Công tác']],
    ];
    people.forEach(([name, email, source, stage, tags], index) => add('contacts', index, { name, email, source, stage, tags, phone: `090000000${index + 1}`, notes: index === 0 ? 'Thích phòng yên tĩnh. Gia đình có một bé nhỏ.' : '' }));
    [
      [0, 0, -3, 2, 'airbnb', 'confirmed', 4750000], [1, 1, 0, 3, 'direct', 'confirmed', 4350000],
      [2, 3, 2, 5, 'booking', 'confirmed', 3600000], [0, 2, 5, 7, 'direct', 'pending', 1900000],
      [3, 4, -8, -5, 'direct', 'confirmed', 2550000],
    ].forEach(([p, c, start, end, source, status, payoutAmount], index) => add('bookings', index, { propertyId: propertyId(Number(p)), contactId: contactId(Number(c)), guestName: people[Number(c)][0], guestEmail: people[Number(c)][1], guestPhone: '', checkIn: day(Number(start)), checkOut: day(Number(end)), source, status, payoutAmount, notes: '' }));
    [
      ['Lê Ngọc Hà', 'Quản lý vận hành', 'ha@example.test'], ['Võ Thanh Mai', 'Chăm sóc khách hàng', 'mai@example.test'], ['Trần Quốc Bảo', 'Buồng phòng', 'bao@example.test'],
    ].forEach(([name, role, email], index) => add('employees', index, { name, role, email, phone: '', status: 'active' }));
    [
      ['Chuẩn bị phòng trước giờ nhận khách', 1, 'Trần Quốc Bảo', 0, 'doing', 'high', 'cleaning'],
      ['Kiểm tra máy lạnh', 0, 'Lê Ngọc Hà', 0, 'todo', 'normal', 'maintenance'],
      ['Gửi hướng dẫn nhận phòng cho Julia', 2, 'Võ Thanh Mai', 1, 'todo', 'high', 'checkin'],
    ].forEach(([title, p, assignee, offset, status, priority, type], index) => add('tasks', index, { title, propertyId: propertyId(Number(p)), assignee, dueDate: day(Number(offset)), status, priority, type, notes: '' }));
    [
      [0, 'facebook', 'open', true, 'Võ Thanh Mai', 'Chào bạn, gia đình mình đến khoảng 13h. Bên mình có hỗ trợ nhận phòng sớm không?'],
      [2, 'zalo', 'open', true, '', 'Mình muốn tìm phòng cho hai người cuối tuần này, còn phòng không ạ?'],
      [1, 'airbnb', 'pending', false, 'Lê Ngọc Hà', 'Thank you! Could you share the check-in instructions?'],
      [4, 'webchat', 'open', false, '', 'Bên mình có xuất hóa đơn cho chuyến công tác không?'],
    ].forEach(([c, platform, status, unread, assignee, text], index) => add('conversations', index, { guestName: people[Number(c)][0], contactId: contactId(Number(c)), platform, status, unread, assignee, tags: people[Number(c)][4], messages: [{ sender: 'guest', text, timestamp: now - (index + 1) * 600000, delivery: 'local' }], lastMessageAt: now - (index + 1) * 600000 }));
    add('rates', 0, { name: 'Ưu đãi đặt sớm', propertyId: propertyId(0), startDate: day(10), endDate: day(24), nightlyRate: 890000, minNights: 2, closed: false });
    add('owners', 0, { name: 'Nguyễn An', email: 'an@example.test', phone: '', propertyIds: [propertyId(0), propertyId(1)], commissionRate: 15 });
    add('guidebooks', 0, { title: 'Chào mừng đến The Nest', propertyId: propertyId(0), welcome: 'Chào mừng bạn đến với MaokiHouse. Chúc bạn có một kỳ nghỉ thật dễ chịu!', checkin: 'Nhận phòng từ 14:00. Vui lòng liên hệ chủ nhà trước khi đến.', wifiName: 'Maoki Guest', wifiPassword: 'demo-wifi-only', houseRules: 'Không hút thuốc trong phòng. Giữ yên lặng sau 22:00.', recommendations: 'Dạo bộ quanh Thảo Điền, thưởng thức cà phê buổi sáng và khám phá những quán ăn nhỏ trong khu phố.', published: false, publicToken: randomBytes(24).toString('hex') });
    add('replies', 0, { title: 'Hướng dẫn nhận phòng', content: 'Chào {{guest}}, cảm ơn bạn đã chọn MaokiHouse! Giờ nhận phòng từ 14:00. Bạn cho mình biết giờ dự kiến đến nhé.' });
    add('replies', 1, { title: 'Tư vấn phòng trống', content: 'Chào {{guest}}, bạn cho mình xin ngày nhận phòng, ngày trả phòng và số khách để mình tư vấn không gian phù hợp nhé!' });
    add('automations', 0, { name: 'Chào khách mới trên hộp thư', trigger: 'new_conversation', action: 'add_tag', content: 'Khách mới', enabled: true, runCount: 0 });
    add('campaigns', 0, { name: 'Một kỳ nghỉ nữa tại Maoki', channel: 'email', audienceTag: 'Khách thân thiết', subject: 'Sài Gòn đang chờ bạn trở lại', content: 'Một không gian quen, một chuyến đi mới. MaokiHouse rất mong được đón bạn trở lại.', status: 'draft', scheduledAt: '' });
    ['airbnb', 'booking', 'agoda', 'facebook', 'instagram', 'zalo', 'email'].forEach((platform, index) => add('integrations', index, { platform, label: platform, status: 'disconnected' }));
    add('revenue', 0, { propertyId: propertyId(3), type: 'booking_payout', amount: 2550000, description: 'Thanh toán kỳ nghỉ của Hoàng Nam', date: day(-5) });
    add('revenue', 1, { propertyId: propertyId(1), type: 'expense', amount: 350000, description: 'Vật dụng phòng & giặt là', date: day(-2) });
    transaction.set(settingsRef, { ...defaultSettings, ...settings.data(), hostId, sampleLoaded: true, widgetToken: settings.data()?.widgetToken || randomBytes(24).toString('hex') });
    return true;
  });
}
