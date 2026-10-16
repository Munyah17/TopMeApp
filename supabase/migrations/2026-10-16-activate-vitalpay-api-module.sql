-- Activate VitalPay api_modules - credentials are configured and tertiary institutions are now live
update public.api_modules set status = 'active' where provider = 'vitalpay';
