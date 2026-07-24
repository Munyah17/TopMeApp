-- ═══════════════════════════════════════════════════════
--  TopMe — Catalog seed data
--  Transcribed from the product prototype (CATS / FLOWCONF /
--  DATA_BUNDLES / TV_PACKAGES / PROVIDER_LABEL / NETWORKS).
--  Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════

insert into public.networks (id, name, color) values
  ('econet', 'Econet', '#0F172A'),
  ('netone', 'NetOne', '#F59E0B'),
  ('telecel', 'Telecel', '#38BDF8')
on conflict (id) do update set name = excluded.name, color = excluded.color;

insert into public.service_categories (id, name, icon, color, bg, description, sort_order) values
  ('airtimedata',  'Airtime & Data',                  'phone',   '#00C853', '#E9FBF0', 'Airtime and data top ups',                      1),
  ('utilent',      'Utilities & Entertainment',        'zap',     '#F59E0B', '#FEF6E7', 'ZESA, TV, vouchers & home power',               2),
  ('insurance',    'Insurance',                        'shield',  '#00C853', '#E9FBF0', 'Vehicle, legal, agriculture & cash plans',      3),
  ('connectivity', 'Connectivity Products & Services', 'wifi',    '#38BDF8', '#EAF8FF', 'ISPs, eSIM & networking gear',                  4),
  ('gadgets',      'Tech Gadgets',                     'laptop',  '#8B5CF6', '#F3EEFE', 'Devices delivered or collected',                5),
  ('education',    'Education',                        'book',    '#F59E0B', '#FEF6E7', 'School & college fees',                         6),
  ('government',   'Government',                       'scale',   '#0F172A', '#EEF1F5', 'Fines & levies',                                7),
  ('travel',       'Travel',                            'fuel',    '#EF4444', '#FDECEC', 'Fuel & toll vouchers',                          8),
  ('gifting',      'Gift Vouchers',                     'gift',    '#00C853', '#E9FBF0', 'Send a redeemable voucher to any phone number', 9)
on conflict (id) do update set
  name = excluded.name, icon = excluded.icon, color = excluded.color, bg = excluded.bg,
  description = excluded.description, sort_order = excluded.sort_order;

-- id, category_id, name, description, icon, provider_label, color, amount_mode,
-- chips, outstanding, needs_network, shows_token, id_label, id_placeholder,
-- extra_field_label, extra_field_placeholder, is_gift, validate_msg, mock_name, mock_sub, sort_order
insert into public.services (
  id, category_id, name, description, icon, provider_label, color, amount_mode,
  chips, outstanding, needs_network, shows_token, id_label, id_placeholder,
  extra_field_label, extra_field_placeholder, is_gift, validate_msg, mock_name, mock_sub, sort_order
) values
  ('airtime', 'airtimedata', 'Airtime Top Up', 'Econet, NetOne, Telecel', 'phone', 'All Networks', '#00C853', 'chips',
    array[1,2,5,10,20], null, true, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Validating number', 'Tendai Moyo', 'Econet · Prepaid line', 1),

  ('data', 'airtimedata', 'Data Bundles', 'Daily, weekly & monthly', 'wifi', 'All Networks', '#00C853', 'bundles',
    null, null, true, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Checking bundles', 'Tendai Moyo', 'Econet · Prepaid line', 2),

  ('zesa', 'utilent', 'ZESA Tokens', 'Prepaid electricity token', 'zap', 'ZESA', '#F59E0B', 'chips',
    array[5,10,20,50,100], null, false, true, 'Meter Number', 'e.g. 04918822',
    null, null, false, 'Validating meter', 'Chipo Ncube', '12 Baines Avenue, Harare', 1),

  ('dstv', 'utilent', 'DStv', 'Renew or upgrade bouquet', 'tv', 'DStv', '#38BDF8', 'packages',
    null, null, false, false, 'Smartcard Number', 'e.g. 7003821940',
    null, null, false, 'Fetching account', 'Farai Chikwava', 'Current package · Compact · Expires 28 Jul', 2),

  ('council', 'utilent', 'Council Bills', 'Rates & municipal services', 'building', 'City Council', '#F59E0B', 'outstanding',
    null, 145, false, false, 'Account Number', 'e.g. CNCL-4471',
    null, null, false, 'Fetching account', 'T. Sibanda', 'Rates & refuse collection', 3),

  ('netflix', 'utilent', 'Netflix Vouchers', 'Prepaid streaming voucher', 'play', 'Netflix', '#EF4444', 'chips',
    array[5,10,15,20], null, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing voucher', 'Tendai Moyo', 'Netflix gift voucher', 4),

  ('spotify', 'utilent', 'Spotify', 'Premium subscription voucher', 'music', 'Spotify', '#00C853', 'chips',
    array[3,6,10], null, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing voucher', 'Tendai Moyo', 'Spotify Premium voucher', 5),

  ('vouchers', 'utilent', 'Vouchers', 'Retail & gift vouchers', 'gift', 'TopMe Store', '#EF4444', 'chips',
    array[5,10,20,50], null, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing voucher', 'Tendai Moyo', 'OK Zimbabwe · Retail voucher', 6),

  ('solarpanels', 'utilent', 'Solar Panels', 'Panel kits & quotes', 'sun', 'TopMe Solar', '#F59E0B', 'chips',
    array[100,250,500,900], null, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing quote', 'Tendai Moyo', 'Solar panel kit enquiry', 7),

  ('lithiumbattery', 'utilent', 'Lithium Batteries', 'Backup power storage', 'battery', 'TopMe Power', '#F59E0B', 'chips',
    array[150,300,600,1200], null, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing quote', 'Tendai Moyo', 'Backup battery enquiry', 8),

  ('fix32kva', 'utilent', '3.2kVA Fix & Supply', 'Inverter install package', 'plug', 'TopMe Install', '#F59E0B', 'outstanding',
    null, 450, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing installation quote', 'Installation Request', '3.2kVA inverter fix & supply', 9),

  ('fix55kva', 'utilent', '5.5kVA Fix & Supply', 'Inverter install package', 'plug', 'TopMe Install', '#F59E0B', 'outstanding',
    null, 780, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing installation quote', 'Installation Request', '5.5kVA inverter fix & supply', 10),

  ('fix62kva', 'utilent', '6.2kVA Fix & Supply', 'Inverter install package', 'plug', 'TopMe Install', '#F59E0B', 'outstanding',
    null, 960, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing installation quote', 'Installation Request', '6.2kVA inverter fix & supply', 11),

  ('vehicleinsurance', 'insurance', 'Vehicle Insurance', 'Comprehensive & third party', 'car', 'Old Mutual', '#00C853', 'outstanding',
    null, 65, false, false, 'Vehicle Registration', 'e.g. AEZ 1234',
    null, null, false, 'Fetching policy', 'Munyah M.', 'Comprehensive cover · Toyota Hilux', 1),

  ('legalinsurance', 'insurance', 'Legal Insurance', 'Legal cover for individuals', 'scale', 'LegalShield', '#00C853', 'outstanding',
    null, 18, false, false, 'Policy Number', 'e.g. POL-33291',
    null, null, false, 'Fetching policy', 'Rutendo Gwenzi', 'LegalShield · Individual plan', 2),

  ('agriinsurance', 'insurance', 'Small Scale Agriculture Insurance', 'Crop & livestock cover', 'leaf', 'AgriCover', '#00C853', 'outstanding',
    null, 35, false, false, 'Farm ID', 'e.g. FARM-4471',
    null, null, false, 'Fetching policy', 'Rutendo Gwenzi', 'Small-scale crop cover', 3),

  ('hospitalcash', 'insurance', 'Hospital Cash Packages', 'Cash payout while admitted', 'heart', 'CIMAS', '#00C853', 'outstanding',
    null, 22, false, false, 'Membership Number', 'e.g. MED-88213',
    null, null, false, 'Validating membership', 'Rutendo Gwenzi', 'Hospital cash plan · Family', 4),

  ('funeralcash', 'insurance', 'Funeral Cash Packages', 'Family funeral cover', 'users', 'First Mutual', '#00C853', 'outstanding',
    null, 15, false, false, 'Policy Number', 'e.g. FCP-77213',
    null, null, false, 'Fetching policy', 'Rutendo Gwenzi', 'Funeral cash plan · Family', 5),

  ('starlink', 'connectivity', 'Starlink', 'Satellite internet account', 'satellite', 'Starlink', '#38BDF8', 'outstanding',
    null, 90, false, false, 'Account Number', 'e.g. STK-88213',
    null, null, false, 'Fetching account', 'Liquid Home Account', 'Starlink Residential', 1),

  ('zol', 'connectivity', 'ZOL', 'Fibre & wireless internet', 'wifi', 'ZOL', '#38BDF8', 'outstanding',
    null, 45, false, false, 'Account Number', 'e.g. ZOL-77213',
    null, null, false, 'Fetching account', 'Liquid Home Account', 'ZOL Fibre · 10mbps', 2),

  ('telone', 'connectivity', 'TelOne', 'ADSL & fibre internet', 'wifi', 'TelOne', '#38BDF8', 'outstanding',
    null, 38, false, false, 'Account Number', 'e.g. TEL-77213',
    null, null, false, 'Fetching account', 'Liquid Home Account', 'TelOne ADSL', 3),

  ('esim', 'connectivity', 'eSIM', 'Digital SIM data plans', 'simcard', 'TopMe eSIM', '#38BDF8', 'chips',
    array[10,20,30,50], null, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing eSIM plan', 'Tendai Moyo', 'eSIM data plan', 4),

  ('utande', 'connectivity', 'Utande', 'Fibre internet account', 'wifi', 'Utande', '#38BDF8', 'outstanding',
    null, 55, false, false, 'Account Number', 'e.g. UTD-77213',
    null, null, false, 'Fetching account', 'Liquid Home Account', 'Utande Fibre', 5),

  ('africom', 'connectivity', 'Africom', 'Wireless internet account', 'wifi', 'Africom', '#38BDF8', 'outstanding',
    null, 42, false, false, 'Account Number', 'e.g. AFC-77213',
    null, null, false, 'Fetching account', 'Liquid Home Account', 'Africom Wireless', 6),

  ('routers', 'connectivity', 'Routers', 'Home & office networking', 'router', 'TopMe Store', '#38BDF8', 'chips',
    array[40,60,90,140], null, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing order', 'Tendai Moyo', 'Router purchase', 7),

  ('ethernetcables', 'connectivity', 'Ethernet Cables', 'Networking accessories', 'cable', 'TopMe Store', '#38BDF8', 'chips',
    array[5,10,15,25], null, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing order', 'Tendai Moyo', 'Ethernet cable purchase', 8),

  ('laptops', 'gadgets', 'Laptops', 'New & refurbished devices', 'laptop', 'TopMe Store', '#8B5CF6', 'chips',
    array[300,500,800,1200], null, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing order', 'Tendai Moyo', 'Laptop enquiry', 1),

  ('phones', 'gadgets', 'Phones', 'Smartphones, all budgets', 'phone', 'TopMe Store', '#8B5CF6', 'chips',
    array[100,200,400,700], null, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing order', 'Tendai Moyo', 'Smartphone enquiry', 2),

  ('accessories', 'gadgets', 'Accessories', 'Cases, chargers & more', 'headphones', 'TopMe Store', '#8B5CF6', 'chips',
    array[5,10,20,35], null, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing order', 'Tendai Moyo', 'Accessory purchase', 3),

  ('gadgetrouters', 'gadgets', 'Routers', 'Home & travel routers', 'router', 'TopMe Store', '#8B5CF6', 'chips',
    array[40,60,90,140], null, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing order', 'Tendai Moyo', 'Router purchase', 4),

  ('screens', 'gadgets', 'Screens', 'Monitors & replacement screens', 'monitor', 'TopMe Store', '#8B5CF6', 'chips',
    array[80,120,200,320], null, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing order', 'Tendai Moyo', 'Monitor / screen enquiry', 5),

  ('schoolfees', 'education', 'School Fees', 'Pay fees to any institution', 'book', 'Education', '#F59E0B', 'outstanding',
    null, 450, false, false, 'Student Number', 'e.g. STU-2291',
    'Institution', 'e.g. Hellenic Academy', false, 'Fetching student record', 'Tanaka Museka', 'Form 3B · Hellenic Academy', 1),

  ('govfees', 'government', 'Government Fees', 'Levies, fines & permits', 'scale', 'ZIMRA', '#0F172A', 'chips',
    array[10,25,50,100], null, false, false, 'Reference Number', 'e.g. REF-99213',
    null, null, false, 'Validating reference', 'Munyaradzi Chirwa', 'Vehicle licensing', 1),

  ('fuel', 'travel', 'Fuel Vouchers', 'Redeemable at any fuel station', 'fuel', 'Puma / Total', '#EF4444', 'chips',
    array[10,20,30,50], null, false, false, 'Phone Number', '077 123 4567',
    null, null, false, 'Preparing voucher', 'Tendai Moyo', 'Redeemable at any Puma/Total station', 1),

  ('gift', 'gifting', 'Gift a Voucher', 'Send a redeemable voucher to any phone number', 'gift', 'TopMe Gift', '#00C853', 'chips',
    array[5,10,20,50,100], null, false, false, 'Receiver Phone Number', '077 123 4567',
    'Your Number (Sender)', 'e.g. 078 987 6543', true, 'Checking number', 'Number Verified', 'Ready to receive a TopMe Gift Voucher', 1)
on conflict (id) do update set
  category_id = excluded.category_id, name = excluded.name, description = excluded.description,
  icon = excluded.icon, provider_label = excluded.provider_label, color = excluded.color,
  amount_mode = excluded.amount_mode, chips = excluded.chips, outstanding = excluded.outstanding,
  needs_network = excluded.needs_network, shows_token = excluded.shows_token,
  id_label = excluded.id_label, id_placeholder = excluded.id_placeholder,
  extra_field_label = excluded.extra_field_label, extra_field_placeholder = excluded.extra_field_placeholder,
  is_gift = excluded.is_gift, validate_msg = excluded.validate_msg,
  mock_name = excluded.mock_name, mock_sub = excluded.mock_sub, sort_order = excluded.sort_order;

insert into public.data_bundles (id, service_id, label, size, price, sub, sort_order) values
  ('d1', 'data', 'Daily',   '250MB',            1, 'Valid 24 hours',            1),
  ('d2', 'data', 'Weekly',  '1.5GB',            3, 'Valid 7 days',              2),
  ('d3', 'data', 'Monthly', '6GB',              9, 'Valid 30 days',             3),
  ('d4', 'data', 'Monthly', 'Unlimited Night', 12, '12am-5am · 30 days',        4),
  ('d5', 'data', 'Promo',   '3GB WhatsApp+',    2, 'Social bundle · 7 days',    5)
on conflict (id) do update set
  label = excluded.label, size = excluded.size, price = excluded.price,
  sub = excluded.sub, sort_order = excluded.sort_order;

insert into public.tv_packages (id, service_id, name, price, sort_order) values
  ('p1', 'dstv', 'Access',       5, 1),
  ('p2', 'dstv', 'Family',      12, 2),
  ('p3', 'dstv', 'Compact',     20, 3),
  ('p4', 'dstv', 'Compact Plus', 30, 4)
on conflict (id) do update set name = excluded.name, price = excluded.price, sort_order = excluded.sort_order;

-- Default API modules — all inactive until a superadmin adds real credentials.
-- 'provider' of 'vitalpay' is the aggregator this app's fulfillment layer knows
-- how to call once VitalPay (Tayari / KMG Vital Links) credentials are added.
insert into public.api_modules (name, provider, category, status, icon, color) values
  ('VitalPay Aggregator (Tayari)', 'vitalpay', 'Airtime & Data, Utilities, Insurance', 'inactive', 'plug', '#00C853')
on conflict do nothing;
