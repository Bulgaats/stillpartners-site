-- Extend the existing device-authenticated backup allowlist; preserve the rest of its current implementation.
do $$declare definition text;needle text='''office_contractor_settings'',''office_rates''';begin
 definition=pg_get_functiondef('office_private.mac_exchange(text,jsonb)'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'Backup allowlist changed; review before applying';end if;
 execute replace(definition,needle,'''office_contractor_settings'',''office_documents'',''office_document_events'',''office_contractor_names'',''office_contractor_name_events'',''office_rates''');
end;$$;
