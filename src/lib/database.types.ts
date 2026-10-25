
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_client_daily": {
                  Row: {
                    "client_hash": string,"day": string,"feature": string,"requests": number
                  }
                  ComputedFields: never
                  Insert: {
                    "client_hash": string,"day": string,"feature": string,"requests"?: number
                  }
                  Update: {
                    "client_hash"?: string,"day"?: string,"feature"?: string,"requests"?: number
                  }
                  Relationships: [
                    
                  ]
                },"ai_usage_daily": {
                  Row: {
                    "audio_seconds": number,"day": string,"failures": number,"feature": string,"input_tokens": number,"output_tokens": number,"requests": number
                  }
                  ComputedFields: never
                  Insert: {
                    "audio_seconds"?: number,"day": string,"failures"?: number,"feature": string,"input_tokens"?: number,"output_tokens"?: number,"requests"?: number
                  }
                  Update: {
                    "audio_seconds"?: number,"day"?: string,"failures"?: number,"feature"?: string,"input_tokens"?: number,"output_tokens"?: number,"requests"?: number
                  }
                  Relationships: [
                    
                  ]
                },"allocations": {
                  Row: {
                    "amount": number,"charge_id": string,"entry_id": string,"id": string,"org_id": string,"posted_at": string,"posted_by": string | null,"property_id": string,"reverses_allocation_id": string | null,"tenancy_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"charge_id": string,"entry_id": string,"id"?: string,"org_id": string,"posted_at"?: string,"posted_by"?: string | null,"property_id": string,"reverses_allocation_id"?: string | null,"tenancy_id": string
                  }
                  Update: {
                    "amount"?: number,"charge_id"?: string,"entry_id"?: string,"id"?: string,"org_id"?: string,"posted_at"?: string,"posted_by"?: string | null,"property_id"?: string,"reverses_allocation_id"?: string | null,"tenancy_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "allocations_charge_id_fkey"
      columns: ["charge_id"]
isOneToOne: false
      referencedRelation: "rent_charges"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "payment_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_posted_by_fkey"
      columns: ["posted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_reverses_allocation_id_fkey"
      columns: ["reverses_allocation_id"]
isOneToOne: true
      referencedRelation: "allocations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allocations_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    }
                  ]
                },"app_settings": {
                  Row: {
                    "key": string,"updated_at": string,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"value": string
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"value"?: string
                  }
                  Relationships: [
                    
                  ]
                },"attachments": {
                  Row: {
                    "created_at": string,"entry_id": string | null,"file_name": string,"id": string,"kind": string,"mime_type": string,"org_id": string,"property_id": string,"removed_at": string | null,"removed_by": string | null,"size_bytes": number,"storage_path": string,"tenancy_id": string | null,"uploaded_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"entry_id"?: string | null,"file_name": string,"id"?: string,"kind"?: string,"mime_type": string,"org_id": string,"property_id": string,"removed_at"?: string | null,"removed_by"?: string | null,"size_bytes": number,"storage_path": string,"tenancy_id"?: string | null,"uploaded_by": string
                  }
                  Update: {
                    "created_at"?: string,"entry_id"?: string | null,"file_name"?: string,"id"?: string,"kind"?: string,"mime_type"?: string,"org_id"?: string,"property_id"?: string,"removed_at"?: string | null,"removed_by"?: string | null,"size_bytes"?: number,"storage_path"?: string,"tenancy_id"?: string | null,"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "payment_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_removed_by_fkey"
      columns: ["removed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_events": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"details": NonNullable<Json>,"id": number,"org_id": string | null,"property_id": string | null,"target_id": string | null,"target_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"org_id"?: string | null,"property_id"?: string | null,"target_id"?: string | null,"target_type": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"org_id"?: string | null,"property_id"?: string | null,"target_id"?: string | null,"target_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_events_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"charge_adjustments": {
                  Row: {
                    "amount": number,"charge_id": string,"created_at": string,"created_by": string | null,"id": string,"org_id": string,"property_id": string,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"charge_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"org_id": string,"property_id": string,"reason": string
                  }
                  Update: {
                    "amount"?: number,"charge_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"org_id"?: string,"property_id"?: string,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "charge_adjustments_charge_id_fkey"
      columns: ["charge_id"]
isOneToOne: false
      referencedRelation: "rent_charges"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charge_adjustments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charge_adjustments_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charge_adjustments_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"contact_events": {
                  Row: {
                    "channel": string,"created_at": string,"id": number,"listing_id": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "channel": string,"created_at"?: string,"id"?: never,"listing_id": string,"user_id"?: string | null
                  }
                  Update: {
                    "channel"?: string,"created_at"?: string,"id"?: never,"listing_id"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_events_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_events_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_reads": {
                  Row: {
                    "conversation_id": string,"last_read_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "conversation_id": string,"last_read_at"?: string,"user_id": string
                  }
                  Update: {
                    "conversation_id"?: string,"last_read_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_reads_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_reads_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "assigned_membership_id": string | null,"created_at": string,"follow_up": string,"id": string,"last_advertiser_message_at": string | null,"last_message_at": string | null,"last_tenant_message_at": string | null,"listing_id": string,"org_id": string,"property_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_membership_id"?: string | null,"created_at"?: string,"follow_up"?: string,"id"?: string,"last_advertiser_message_at"?: string | null,"last_message_at"?: string | null,"last_tenant_message_at"?: string | null,"listing_id": string,"org_id": string,"property_id": string,"tenant_id": string
                  }
                  Update: {
                    "assigned_membership_id"?: string | null,"created_at"?: string,"follow_up"?: string,"id"?: string,"last_advertiser_message_at"?: string | null,"last_message_at"?: string | null,"last_tenant_message_at"?: string | null,"listing_id"?: string,"org_id"?: string,"property_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_assigned_membership_id_fkey"
      columns: ["assigned_membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"delivery_tasks": {
                  Row: {
                    "attempts": number,"channel": string,"created_at": string,"destination": string,"event_key": string,"id": string,"last_error": string | null,"next_attempt_at": string,"org_id": string | null,"payload": NonNullable<Json>,"provider_ref": string | null,"released_at": string | null,"released_by": string | null,"status": string,"template": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"channel": string,"created_at"?: string,"destination": string,"event_key": string,"id"?: string,"last_error"?: string | null,"next_attempt_at"?: string,"org_id"?: string | null,"payload"?: NonNullable<Json>,"provider_ref"?: string | null,"released_at"?: string | null,"released_by"?: string | null,"status"?: string,"template": string,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"channel"?: string,"created_at"?: string,"destination"?: string,"event_key"?: string,"id"?: string,"last_error"?: string | null,"next_attempt_at"?: string,"org_id"?: string | null,"payload"?: NonNullable<Json>,"provider_ref"?: string | null,"released_at"?: string | null,"released_by"?: string | null,"status"?: string,"template"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "delivery_tasks_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "delivery_tasks_released_by_fkey"
      columns: ["released_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"entry_events": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"details": NonNullable<Json>,"entry_id": string,"id": number,"org_id": string,"property_id": string,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entry_id": string,"id"?: never,"org_id": string,"property_id": string,"reason"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entry_id"?: string,"id"?: never,"org_id"?: string,"property_id"?: string,"reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "entry_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entry_events_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "payment_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entry_events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entry_events_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_charges": {
                  Row: {
                    "amount": number | null,"billing": string,"compulsory": boolean,"created_at": string,"frequency": string,"id": string,"kind": string,"label": string | null,"listing_id": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"billing"?: string,"compulsory"?: boolean,"created_at"?: string,"frequency"?: string,"id"?: string,"kind": string,"label"?: string | null,"listing_id": string,"position"?: number
                  }
                  Update: {
                    "amount"?: number | null,"billing"?: string,"compulsory"?: boolean,"created_at"?: string,"frequency"?: string,"id"?: string,"kind"?: string,"label"?: string | null,"listing_id"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_charges_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_photos": {
                  Row: {
                    "alt_text": string | null,"created_at": string,"height": number | null,"id": string,"is_cover": boolean,"listing_id": string,"media_label": string,"org_id": string,"position": number,"size_bytes": number | null,"storage_path": string,"thumb_path": string | null,"uploaded_by": string | null,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_text"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"is_cover"?: boolean,"listing_id": string,"media_label"?: string,"org_id": string,"position"?: number,"size_bytes"?: number | null,"storage_path": string,"thumb_path"?: string | null,"uploaded_by"?: string | null,"width"?: number | null
                  }
                  Update: {
                    "alt_text"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"is_cover"?: boolean,"listing_id"?: string,"media_label"?: string,"org_id"?: string,"position"?: number,"size_bytes"?: number | null,"storage_path"?: string,"thumb_path"?: string | null,"uploaded_by"?: string | null,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_photos_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listing_photos_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listing_photos_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_reports": {
                  Row: {
                    "created_at": string,"details": string | null,"id": string,"listing_id": string,"reason": string,"reporter_id": string,"resolution_note": string | null,"resolved_by": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details"?: string | null,"id"?: string,"listing_id": string,"reason": string,"reporter_id": string,"resolution_note"?: string | null,"resolved_by"?: string | null,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"details"?: string | null,"id"?: string,"listing_id"?: string,"reason"?: string,"reporter_id"?: string,"resolution_note"?: string | null,"resolved_by"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_reports_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listing_reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listing_reports_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"listings": {
                  Row: {
                    "availability_confirmed_at": string | null,"availability_confirmed_by": string | null,"available_from": string | null,"contact_call": boolean,"contact_phone": string | null,"contact_whatsapp": boolean,"created_at": string,"created_by": string | null,"deposit_amount": number | null,"deposit_months": number | null,"description": string | null,"fixed_monthly_total": number | null,"flags": NonNullable<Json>,"furnishing": string | null,"house_rules": string | null,"id": string,"let_on": string | null,"move_in_total": number | null,"org_id": string,"pending_edit": Json | null,"price_basis": string,"price_period": string,"property_id": string,"published_at": string | null,"ref": string,"rent_amount": number | null,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"sponsored_until": string | null,"status": string,"student": boolean,"submitted_at": string | null,"title": string | null,"totals_complete": boolean,"unit_id": string,"updated_at": string,"viewing_instructions": string | null,"wizard_step": number
                  }
                  ComputedFields: never
                  Insert: {
                    "availability_confirmed_at"?: string | null,"availability_confirmed_by"?: string | null,"available_from"?: string | null,"contact_call"?: boolean,"contact_phone"?: string | null,"contact_whatsapp"?: boolean,"created_at"?: string,"created_by"?: string | null,"deposit_amount"?: number | null,"deposit_months"?: number | null,"description"?: string | null,"fixed_monthly_total"?: number | null,"flags"?: NonNullable<Json>,"furnishing"?: string | null,"house_rules"?: string | null,"id"?: string,"let_on"?: string | null,"move_in_total"?: number | null,"org_id": string,"pending_edit"?: Json | null,"price_basis"?: string,"price_period"?: string,"property_id": string,"published_at"?: string | null,"ref"?: string,"rent_amount"?: number | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sponsored_until"?: string | null,"status"?: string,"student"?: boolean,"submitted_at"?: string | null,"title"?: string | null,"totals_complete"?: boolean,"unit_id": string,"updated_at"?: string,"viewing_instructions"?: string | null,"wizard_step"?: number
                  }
                  Update: {
                    "availability_confirmed_at"?: string | null,"availability_confirmed_by"?: string | null,"available_from"?: string | null,"contact_call"?: boolean,"contact_phone"?: string | null,"contact_whatsapp"?: boolean,"created_at"?: string,"created_by"?: string | null,"deposit_amount"?: number | null,"deposit_months"?: number | null,"description"?: string | null,"fixed_monthly_total"?: number | null,"flags"?: NonNullable<Json>,"furnishing"?: string | null,"house_rules"?: string | null,"id"?: string,"let_on"?: string | null,"move_in_total"?: number | null,"org_id"?: string,"pending_edit"?: Json | null,"price_basis"?: string,"price_period"?: string,"property_id"?: string,"published_at"?: string | null,"ref"?: string,"rent_amount"?: number | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sponsored_until"?: string | null,"status"?: string,"student"?: boolean,"submitted_at"?: string | null,"title"?: string | null,"totals_complete"?: boolean,"unit_id"?: string,"updated_at"?: string,"viewing_instructions"?: string | null,"wizard_step"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "listings_availability_confirmed_by_fkey"
      columns: ["availability_confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"membership_properties": {
                  Row: {
                    "created_at": string,"membership_id": string,"property_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"membership_id": string,"property_id": string
                  }
                  Update: {
                    "created_at"?: string,"membership_id"?: string,"property_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_properties_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "membership_properties_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "accepted_at": string | null,"all_properties": boolean,"can_confirm": boolean,"can_correct": boolean,"can_enter_payments": boolean,"can_export": boolean,"can_manage_listings": boolean,"can_manage_tenancies": boolean,"can_view_attachments": boolean,"created_at": string,"display_name": string,"id": string,"invite_expires_at": string | null,"invite_token_hash": string | null,"invited_by": string | null,"invited_email": string | null,"invited_phone": string | null,"last_active_at": string | null,"org_id": string,"role": string,"status": string,"status_changed_at": string | null,"status_changed_by": string | null,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"all_properties"?: boolean,"can_confirm"?: boolean,"can_correct"?: boolean,"can_enter_payments"?: boolean,"can_export"?: boolean,"can_manage_listings"?: boolean,"can_manage_tenancies"?: boolean,"can_view_attachments"?: boolean,"created_at"?: string,"display_name": string,"id"?: string,"invite_expires_at"?: string | null,"invite_token_hash"?: string | null,"invited_by"?: string | null,"invited_email"?: string | null,"invited_phone"?: string | null,"last_active_at"?: string | null,"org_id": string,"role": string,"status": string,"status_changed_at"?: string | null,"status_changed_by"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"all_properties"?: boolean,"can_confirm"?: boolean,"can_correct"?: boolean,"can_enter_payments"?: boolean,"can_export"?: boolean,"can_manage_listings"?: boolean,"can_manage_tenancies"?: boolean,"can_view_attachments"?: boolean,"created_at"?: string,"display_name"?: string,"id"?: string,"invite_expires_at"?: string | null,"invite_token_hash"?: string | null,"invited_by"?: string | null,"invited_email"?: string | null,"invited_phone"?: string | null,"last_active_at"?: string | null,"org_id"?: string,"role"?: string,"status"?: string,"status_changed_at"?: string | null,"status_changed_by"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_status_changed_by_fkey"
      columns: ["status_changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": string,"client_ref": string | null,"conversation_id": string,"created_at": string,"id": string,"sender_id": string | null,"sender_side": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"client_ref"?: string | null,"conversation_id": string,"created_at"?: string,"id"?: string,"sender_id"?: string | null,"sender_side": string
                  }
                  Update: {
                    "body"?: string,"client_ref"?: string | null,"conversation_id"?: string,"created_at"?: string,"id"?: string,"sender_id"?: string | null,"sender_side"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_settings": {
                  Row: {
                    "email_off": (string)[],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "email_off"?: (string)[],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "email_off"?: (string)[],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"event_key": string,"id": string,"kind": string,"link": string | null,"org_id": string | null,"read_at": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"event_key": string,"id"?: string,"kind": string,"link"?: string | null,"org_id"?: string | null,"read_at"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"event_key"?: string,"id"?: string,"kind"?: string,"link"?: string | null,"org_id"?: string | null,"read_at"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "advertiser_role": string,"authority_checked_at": string | null,"contact_email": string | null,"contact_phone": string | null,"contact_whatsapp": string | null,"created_at": string,"created_by": string,"currency": string,"id": string,"identity_checked_at": string | null,"kind": string,"name": string,"onboarding_assignee": string | null,"onboarding_note": string | null,"onboarding_status": string,"timezone": string,"updated_at": string,"usually_replies": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "advertiser_role"?: string,"authority_checked_at"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"contact_whatsapp"?: string | null,"created_at"?: string,"created_by": string,"currency"?: string,"id"?: string,"identity_checked_at"?: string | null,"kind": string,"name": string,"onboarding_assignee"?: string | null,"onboarding_note"?: string | null,"onboarding_status"?: string,"timezone"?: string,"updated_at"?: string,"usually_replies"?: string | null
                  }
                  Update: {
                    "advertiser_role"?: string,"authority_checked_at"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"contact_whatsapp"?: string | null,"created_at"?: string,"created_by"?: string,"currency"?: string,"id"?: string,"identity_checked_at"?: string | null,"kind"?: string,"name"?: string,"onboarding_assignee"?: string | null,"onboarding_note"?: string | null,"onboarding_status"?: string,"timezone"?: string,"updated_at"?: string,"usually_replies"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "organizations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organizations_onboarding_assignee_fkey"
      columns: ["onboarding_assignee"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_entries": {
                  Row: {
                    "amount": number,"assigned_to": string | null,"client_request_id": string,"confirm_acknowledged": boolean,"confirmed_at": string | null,"confirmed_by": string | null,"created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_reason": string | null,"id": string,"kind": string,"method": string | null,"notes": string | null,"org_id": string,"paid_on": string,"property_id": string,"proposed_allocations": NonNullable<Json>,"recorded_at": string,"recorded_by": string,"ref": string,"reference": string | null,"replaces_entry_id": string | null,"reversal_reason": string | null,"reversed_at": string | null,"reversed_by": string | null,"status": string,"submitted_at": string | null,"submitted_by": string | null,"tenancy_id": string,"unit_id": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"assigned_to"?: string | null,"client_request_id": string,"confirm_acknowledged"?: boolean,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"id"?: string,"kind"?: string,"method"?: string | null,"notes"?: string | null,"org_id": string,"paid_on": string,"property_id": string,"proposed_allocations"?: NonNullable<Json>,"recorded_at"?: string,"recorded_by": string,"ref"?: string,"reference"?: string | null,"replaces_entry_id"?: string | null,"reversal_reason"?: string | null,"reversed_at"?: string | null,"reversed_by"?: string | null,"status": string,"submitted_at"?: string | null,"submitted_by"?: string | null,"tenancy_id": string,"unit_id": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "amount"?: number,"assigned_to"?: string | null,"client_request_id"?: string,"confirm_acknowledged"?: boolean,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_reason"?: string | null,"id"?: string,"kind"?: string,"method"?: string | null,"notes"?: string | null,"org_id"?: string,"paid_on"?: string,"property_id"?: string,"proposed_allocations"?: NonNullable<Json>,"recorded_at"?: string,"recorded_by"?: string,"ref"?: string,"reference"?: string | null,"replaces_entry_id"?: string | null,"reversal_reason"?: string | null,"reversed_at"?: string | null,"reversed_by"?: string | null,"status"?: string,"submitted_at"?: string | null,"submitted_by"?: string | null,"tenancy_id"?: string,"unit_id"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_entries_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_entries_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_entries_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_entries_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_entries_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_entries_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_entries_replaces_entry_id_fkey"
      columns: ["replaces_entry_id"]
isOneToOne: false
      referencedRelation: "payment_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_entries_reversed_by_fkey"
      columns: ["reversed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_entries_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_entries_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_entries_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_reports": {
                  Row: {
                    "amount": number,"answered_at": string | null,"answered_by": string | null,"client_request_id": string,"created_at": string,"created_by": string,"entry_id": string | null,"id": string,"method": string | null,"note": string | null,"org_id": string,"paid_on": string,"property_id": string,"reference": string | null,"reply": string | null,"status": string,"tenancy_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"answered_at"?: string | null,"answered_by"?: string | null,"client_request_id": string,"created_at"?: string,"created_by": string,"entry_id"?: string | null,"id"?: string,"method"?: string | null,"note"?: string | null,"org_id": string,"paid_on": string,"property_id": string,"reference"?: string | null,"reply"?: string | null,"status"?: string,"tenancy_id": string,"tenant_id": string
                  }
                  Update: {
                    "amount"?: number,"answered_at"?: string | null,"answered_by"?: string | null,"client_request_id"?: string,"created_at"?: string,"created_by"?: string,"entry_id"?: string | null,"id"?: string,"method"?: string | null,"note"?: string | null,"org_id"?: string,"paid_on"?: string,"property_id"?: string,"reference"?: string | null,"reply"?: string | null,"status"?: string,"tenancy_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_reports_answered_by_fkey"
      columns: ["answered_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_reports_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_reports_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "payment_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_reports_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_reports_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_reports_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_reports_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"role"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_admins_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string | null,"full_name": string,"id": string,"last_org_id": string | null,"last_role": string | null,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string,"id": string,"last_org_id"?: string | null,"last_role"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"last_org_id"?: string | null,"last_role"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"properties": {
                  Row: {
                    "archived_at": string | null,"area": string,"auto_charges": boolean,"building_style": string | null,"county": string | null,"created_at": string,"created_by": string | null,"description": string | null,"evidence_policy": string,"id": string,"landmark": string | null,"latitude": number | null,"longitude": number | null,"name": string,"org_id": string,"owner_label": string | null,"property_visited_at": string | null,"rent_due_day": number,"road": string | null,"town": string | null,"updated_at": string,"viewing_address": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"area": string,"auto_charges"?: boolean,"building_style"?: string | null,"county"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"evidence_policy"?: string,"id"?: string,"landmark"?: string | null,"latitude"?: number | null,"longitude"?: number | null,"name": string,"org_id": string,"owner_label"?: string | null,"property_visited_at"?: string | null,"rent_due_day"?: number,"road"?: string | null,"town"?: string | null,"updated_at"?: string,"viewing_address"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"area"?: string,"auto_charges"?: boolean,"building_style"?: string | null,"county"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"evidence_policy"?: string,"id"?: string,"landmark"?: string | null,"latitude"?: number | null,"longitude"?: number | null,"name"?: string,"org_id"?: string,"owner_label"?: string | null,"property_visited_at"?: string | null,"rent_due_day"?: number,"road"?: string | null,"town"?: string | null,"updated_at"?: string,"viewing_address"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "properties_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "properties_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"rent_charges": {
                  Row: {
                    "amount": number,"category": string,"created_at": string,"created_by": string | null,"description": string | null,"due_date": string,"id": string,"org_id": string,"period_start": string,"property_id": string,"tenancy_id": string,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"category": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date": string,"id"?: string,"org_id": string,"period_start": string,"property_id": string,"tenancy_id": string,"unit_id": string
                  }
                  Update: {
                    "amount"?: number,"category"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string,"id"?: string,"org_id"?: string,"period_start"?: string,"property_id"?: string,"tenancy_id"?: string,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rent_charges_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rent_charges_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rent_charges_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rent_charges_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rent_charges_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"rent_follow_ups": {
                  Row: {
                    "assigned_to": string | null,"client_request_id": string,"created_at": string,"created_by": string | null,"due_on": string | null,"id": string,"kind": string,"note": string | null,"org_id": string,"promised_amount": number | null,"property_id": string,"resolution": string | null,"resolved_at": string | null,"resolved_by": string | null,"tenancy_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"client_request_id": string,"created_at"?: string,"created_by"?: string | null,"due_on"?: string | null,"id"?: string,"kind": string,"note"?: string | null,"org_id": string,"promised_amount"?: number | null,"property_id": string,"resolution"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"tenancy_id": string
                  }
                  Update: {
                    "assigned_to"?: string | null,"client_request_id"?: string,"created_at"?: string,"created_by"?: string | null,"due_on"?: string | null,"id"?: string,"kind"?: string,"note"?: string | null,"org_id"?: string,"promised_amount"?: number | null,"property_id"?: string,"resolution"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"tenancy_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rent_follow_ups_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rent_follow_ups_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rent_follow_ups_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rent_follow_ups_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rent_follow_ups_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rent_follow_ups_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    }
                  ]
                },"report_versions": {
                  Row: {
                    "change_note": string | null,"commentary": Json | null,"finalized_at": string,"id": string,"notes": string | null,"org_id": string,"period_start": string,"prepared_by": string,"property_id": string,"snapshot": NonNullable<Json>,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "change_note"?: string | null,"commentary"?: Json | null,"finalized_at"?: string,"id"?: string,"notes"?: string | null,"org_id": string,"period_start": string,"prepared_by": string,"property_id": string,"snapshot": NonNullable<Json>,"version": number
                  }
                  Update: {
                    "change_note"?: string | null,"commentary"?: Json | null,"finalized_at"?: string,"id"?: string,"notes"?: string | null,"org_id"?: string,"period_start"?: string,"prepared_by"?: string,"property_id"?: string,"snapshot"?: NonNullable<Json>,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "report_versions_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "report_versions_prepared_by_fkey"
      columns: ["prepared_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "report_versions_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_listings": {
                  Row: {
                    "created_at": string,"listing_id": string,"note": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"listing_id": string,"note"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"listing_id"?: string,"note"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_listings_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saved_listings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_searches": {
                  Row: {
                    "alert_frequency": string,"created_at": string,"id": string,"label": string,"last_alerted_at": string,"last_checked_at": string | null,"last_seen_at": string,"params": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alert_frequency"?: string,"created_at"?: string,"id"?: string,"label": string,"last_alerted_at"?: string,"last_checked_at"?: string | null,"last_seen_at"?: string,"params": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "alert_frequency"?: string,"created_at"?: string,"id"?: string,"label"?: string,"last_alerted_at"?: string,"last_checked_at"?: string | null,"last_seen_at"?: string,"params"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_searches_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"support_files": {
                  Row: {
                    "created_at": string,"file_name": string,"id": string,"mime_type": string,"size_bytes": number,"storage_path": string,"ticket_id": string,"uploaded_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"file_name": string,"id"?: string,"mime_type": string,"size_bytes": number,"storage_path": string,"ticket_id": string,"uploaded_by": string
                  }
                  Update: {
                    "created_at"?: string,"file_name"?: string,"id"?: string,"mime_type"?: string,"size_bytes"?: number,"storage_path"?: string,"ticket_id"?: string,"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_files_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "support_tickets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_files_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"support_messages": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"id": string,"side": string,"ticket_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"id"?: string,"side": string,"ticket_id": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"id"?: string,"side"?: string,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_messages_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_messages_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "support_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"support_tickets": {
                  Row: {
                    "assignee_id": string | null,"category": string,"client_ref": string | null,"context_link": string | null,"created_at": string,"description": string,"id": string,"priority": string,"ref": string,"resolved_at": string | null,"status": string,"subject": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignee_id"?: string | null,"category": string,"client_ref"?: string | null,"context_link"?: string | null,"created_at"?: string,"description": string,"id"?: string,"priority"?: string,"ref"?: string,"resolved_at"?: string | null,"status"?: string,"subject": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "assignee_id"?: string | null,"category"?: string,"client_ref"?: string | null,"context_link"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"priority"?: string,"ref"?: string,"resolved_at"?: string | null,"status"?: string,"subject"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_tickets_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_tickets_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"tenancies": {
                  Row: {
                    "billing_cycle": string,"created_at": string,"created_by": string | null,"deposit_held": number | null,"due_day": number,"end_date": string | null,"ended_reason": string | null,"id": string,"org_id": string,"property_id": string,"start_date": string,"status": string,"tenant_id": string,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_cycle"?: string,"created_at"?: string,"created_by"?: string | null,"deposit_held"?: number | null,"due_day": number,"end_date"?: string | null,"ended_reason"?: string | null,"id"?: string,"org_id": string,"property_id": string,"start_date": string,"status"?: string,"tenant_id": string,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "billing_cycle"?: string,"created_at"?: string,"created_by"?: string | null,"deposit_held"?: number | null,"due_day"?: number,"end_date"?: string | null,"ended_reason"?: string | null,"id"?: string,"org_id"?: string,"property_id"?: string,"start_date"?: string,"status"?: string,"tenant_id"?: string,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenancies_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancies_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancies_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancies_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancies_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"tenancy_rent_rates": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"effective_from": string,"id": string,"note": string | null,"tenancy_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"effective_from": string,"id"?: string,"note"?: string | null,"tenancy_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"effective_from"?: string,"id"?: string,"note"?: string | null,"tenancy_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenancy_rent_rates_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancy_rent_rates_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    }
                  ]
                },"tenant_messages": {
                  Row: {
                    "body": string | null,"client_request_id": string,"created_at": string,"delivery_error": string | null,"delivery_status": string,"details": NonNullable<Json>,"email": string,"id": string,"kind": string,"org_id": string,"period_start": string | null,"property_id": string,"ref": string | null,"sent_by": string | null,"subject": string,"tenancy_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"client_request_id": string,"created_at"?: string,"delivery_error"?: string | null,"delivery_status"?: string,"details"?: NonNullable<Json>,"email": string,"id"?: string,"kind": string,"org_id": string,"period_start"?: string | null,"property_id": string,"ref"?: string | null,"sent_by"?: string | null,"subject": string,"tenancy_id": string,"tenant_id": string
                  }
                  Update: {
                    "body"?: string | null,"client_request_id"?: string,"created_at"?: string,"delivery_error"?: string | null,"delivery_status"?: string,"details"?: NonNullable<Json>,"email"?: string,"id"?: string,"kind"?: string,"org_id"?: string,"period_start"?: string | null,"property_id"?: string,"ref"?: string | null,"sent_by"?: string | null,"subject"?: string,"tenancy_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_messages_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenant_messages_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenant_messages_sent_by_fkey"
      columns: ["sent_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenant_messages_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenant_messages_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenants": {
                  Row: {
                    "access_email": string | null,"access_expires_at": string | null,"access_invited_by": string | null,"access_token_hash": string | null,"created_at": string,"created_by": string | null,"email": string | null,"full_name": string,"id": string,"notes": string | null,"org_id": string,"phone": string | null,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "access_email"?: string | null,"access_expires_at"?: string | null,"access_invited_by"?: string | null,"access_token_hash"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name": string,"id"?: string,"notes"?: string | null,"org_id": string,"phone"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "access_email"?: string | null,"access_expires_at"?: string | null,"access_invited_by"?: string | null,"access_token_hash"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name"?: string,"id"?: string,"notes"?: string | null,"org_id"?: string,"phone"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenants_access_invited_by_fkey"
      columns: ["access_invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenants_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenants_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"units": {
                  Row: {
                    "bathrooms": number | null,"bedrooms": number | null,"building_style": string | null,"created_at": string,"default_rent": number | null,"facts": NonNullable<Json>,"floor_level": number | null,"id": string,"label": string,"layout": string,"occupancy": string,"occupancy_date": string | null,"org_id": string,"origin": string | null,"property_id": string,"rental_scope": string,"size_sqm": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bathrooms"?: number | null,"bedrooms"?: number | null,"building_style"?: string | null,"created_at"?: string,"default_rent"?: number | null,"facts"?: NonNullable<Json>,"floor_level"?: number | null,"id"?: string,"label": string,"layout"?: string,"occupancy"?: string,"occupancy_date"?: string | null,"org_id": string,"origin"?: string | null,"property_id": string,"rental_scope"?: string,"size_sqm"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "bathrooms"?: number | null,"bedrooms"?: number | null,"building_style"?: string | null,"created_at"?: string,"default_rent"?: number | null,"facts"?: NonNullable<Json>,"floor_level"?: number | null,"id"?: string,"label"?: string,"layout"?: string,"occupancy"?: string,"occupancy_date"?: string | null,"org_id"?: string,"origin"?: string | null,"property_id"?: string,"rental_scope"?: string,"size_sqm"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "units_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "units_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"user_activity": {
                  Row: {
                    "last_active_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "last_active_at"?: string,"user_id": string
                  }
                  Update: {
                    "last_active_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_activity_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"viewings": {
                  Row: {
                    "cancel_reason": string | null,"cancelled_by_side": string | null,"client_ref": string | null,"confirmed_start": string | null,"conversation_id": string | null,"created_at": string,"decline_reason": string | null,"id": string,"listing_id": string,"meeting_instructions": string | null,"org_id": string,"property_id": string,"proposed_start": string | null,"requested_start": string,"status": string,"tenant_id": string,"tenant_note": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_reason"?: string | null,"cancelled_by_side"?: string | null,"client_ref"?: string | null,"confirmed_start"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"decline_reason"?: string | null,"id"?: string,"listing_id": string,"meeting_instructions"?: string | null,"org_id": string,"property_id": string,"proposed_start"?: string | null,"requested_start": string,"status"?: string,"tenant_id": string,"tenant_note"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "cancel_reason"?: string | null,"cancelled_by_side"?: string | null,"client_ref"?: string | null,"confirmed_start"?: string | null,"conversation_id"?: string | null,"created_at"?: string,"decline_reason"?: string | null,"id"?: string,"listing_id"?: string,"meeting_instructions"?: string | null,"org_id"?: string,"property_id"?: string,"proposed_start"?: string | null,"requested_start"?: string,"status"?: string,"tenant_id"?: string,"tenant_note"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "viewings_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "viewings_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "viewings_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "viewings_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "viewings_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "viewings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "viewing_states": {
                  Row: {
                    "cancel_reason": string | null,"cancelled_by_side": string | null,"client_ref": string | null,"confirmed_start": string | null,"conversation_id": string | null,"created_at": string | null,"decline_reason": string | null,"id": string | null,"listing_id": string | null,"meeting_instructions": string | null,"org_id": string | null,"property_id": string | null,"proposed_start": string | null,"requested_start": string | null,"state": string | null,"status": string | null,"tenant_id": string | null,"tenant_note": string | null,"updated_at": string | null,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "cancel_reason"?: string | null,"cancelled_by_side"?: string | null,"client_ref"?: string | null,"confirmed_start"?: string | null,"conversation_id"?: string | null,"created_at"?: string | null,"decline_reason"?: string | null,"id"?: string | null,"listing_id"?: string | null,"meeting_instructions"?: string | null,"org_id"?: string | null,"property_id"?: string | null,"proposed_start"?: string | null,"requested_start"?: string | null,"state"?: never,"status"?: string | null,"tenant_id"?: string | null,"tenant_note"?: string | null,"updated_at"?: string | null,"updated_by"?: string | null
                         }
                        Update: {
                           "cancel_reason"?: string | null,"cancelled_by_side"?: string | null,"client_ref"?: string | null,"confirmed_start"?: string | null,"conversation_id"?: string | null,"created_at"?: string | null,"decline_reason"?: string | null,"id"?: string | null,"listing_id"?: string | null,"meeting_instructions"?: string | null,"org_id"?: string | null,"property_id"?: string | null,"proposed_start"?: string | null,"requested_start"?: string | null,"state"?: never,"status"?: string | null,"tenant_id"?: string | null,"tenant_note"?: string | null,"updated_at"?: string | null,"updated_by"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "viewings_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "viewings_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "viewings_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "viewings_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "viewings_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "viewings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"accept_tenant_access":
{ Args: { "p_token": string }; Returns: string
                           },
"add_follow_up":
{ Args: { "p": Json }; Returns: string
                           },
"adjust_charge":
{ Args: { "p_charge": string,"p_reason": string,"p_reduce_by": number }; Returns: undefined
                           },
"admin_cancel_delivery":
{ Args: { "p_task": string }; Returns: undefined
                           },
"admin_delivery_health":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_delivery_tasks":
{ Args: { "p_limit"?: number }; Returns: {
              "attempts": number,"channel": string,"created_at": string,"destination_masked": string,"id": string,"last_error": string,"next_attempt_at": string,"released_at": string,"state": string,"status": string,"template": string,"updated_at": string
            }[]
                           },
"admin_onboarding_queue":
{ Args: Record<PropertyKey, never>; Returns: {
              "advertiser_role": string,"assignee_id": string,"assignee_name": string,"authority_checked_at": string,"created_at": string,"identity_checked_at": string,"kind": string,"listing_count": number,"name": string,"onboarding_note": string,"onboarding_status": string,"org_id": string,"owner_email": string,"owner_name": string,"owner_phone": string,"property_count": number
            }[]
                           },
"admin_queue_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_recent_registrations":
{ Args: { "p_limit"?: number }; Returns: {
              "created_at": string,"email": string,"full_name": string,"user_id": string,"workspaces": number
            }[]
                           },
"admin_record_property_visit":
{ Args: { "p_date": string,"p_property": string }; Returns: undefined
                           },
"admin_resolve_report":
{ Args: { "p_note": string,"p_report": string,"p_status": string }; Returns: undefined
                           },
"admin_retry_delivery":
{ Args: { "p_task": string }; Returns: undefined
                           },
"admin_review_listing":
{ Args: { "p_decision": string,"p_listing": string,"p_note": string }; Returns: undefined
                           },
"admin_review_queue":
{ Args: Record<PropertyKey, never>; Returns: {
              "advertiser_role": string,"area": string,"authority_checked_at": string,"flags": Json,"id": string,"identity_checked_at": string,"org_id": string,"org_name": string,"photo_count": number,"price_basis": string,"ref": string,"rent_amount": number,"status": string,"submitted_at": string,"title": string,"totals_complete": boolean
            }[]
                           },
"admin_update_onboarding":
{ Args: { "p_assign_to_me"?: boolean,"p_authority_checked"?: string,"p_identity_checked"?: string,"p_note"?: string,"p_org": string,"p_status"?: string }; Returns: undefined
                           },
"admin_update_ticket":
{ Args: { "p": Json,"p_ticket": string }; Returns: undefined
                           },
"ai_record":
{ Args: { "p_audio": number,"p_failed": boolean,"p_feature": string,"p_input": number,"p_output": number }; Returns: undefined
                           },
"ai_take":
{ Args: { "p_client": string,"p_client_cap": number,"p_feature": string,"p_global_cap": number }; Returns: string
                           },
"answer_payment_report":
{ Args: { "p": Json }; Returns: undefined
                           },
"apply_credit":
{ Args: { "p_allocations": Json,"p_entry": string }; Returns: Json
                           },
"arrears_ageing":
{ Args: { "p_org": string,"p_property": string }; Returns: {
              "amount": number,"bucket": string,"units": number
            }[]
                           },
"build_report":
{ Args: { "p_period": string,"p_property": string }; Returns: Json
                           },
"cancel_invitation":
{ Args: { "p_membership": string }; Returns: undefined
                           },
"change_rent":
{ Args: { "p_amount": number,"p_effective_from": string,"p_note": string,"p_tenancy": string }; Returns: undefined
                           },
"claim_delivery_tasks":
{ Args: { "p_limit"?: number }; Returns: {
              "attempts": number,
"channel": string,
"created_at": string,
"destination": string,
"event_key": string,
"id": string,
"last_error": string | null,
"next_attempt_at": string,
"org_id": string | null,
"payload": NonNullable<Json>,
"provider_ref": string | null,
"released_at": string | null,
"released_by": string | null,
"status": string,
"template": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "delivery_tasks"
        isOneToOne: false
        isSetofReturn: true
      } },
"claim_saved_search_checks":
{ Args: { "p_limit"?: number }; Returns: {
              "checked_at": string,"id": string,"query": string,"since": string,"user_id": string
            }[]
                           },
"confirm_entries":
{ Args: { "p_acknowledged": boolean,"p_entries": (string)[] }; Returns: Json
                           },
"confirm_still_available":
{ Args: { "p_listings": (string)[] }; Returns: Json
                           },
"conversation_activity":
{ Args: { "p_ids": (string)[] }; Returns: {
              "conversation_id": string,"last_active_at": string
            }[]
                           },
"correct_entry":
{ Args: { "p": Json,"p_entry": string,"p_reason": string }; Returns: Json
                           },
"create_support_ticket":
{ Args: { "p": Json }; Returns: Json
                           },
"create_tenancy":
{ Args: { "p": Json }; Returns: string
                           },
"create_workspace":
{ Args: { "p_advertiser_role"?: string,"p_kind": string,"p_name": string,"p_phone"?: string }; Returns: string
                           },
"decide_entry":
{ Args: { "p_acknowledged"?: boolean,"p_decision": string,"p_entry": string,"p_expected_version"?: number,"p_reason"?: string }; Returns: Json
                           },
"end_tenancy":
{ Args: { "p_end_date": string,"p_reason": string,"p_tenancy": string,"p_unit_occupancy"?: string }; Returns: undefined
                           },
"finalize_report":
{ Args: { "p_change_note"?: string,"p_commentary"?: Json,"p_notes": string,"p_period": string,"p_property": string }; Returns: Json
                           },
"finish_delivery_task":
{ Args: { "p_error": string,"p_ok": boolean,"p_provider_ref": string,"p_retryable"?: boolean,"p_task": string }; Returns: undefined
                           },
"generate_rent_charges":
{ Args: { "p_period": string,"p_property": string }; Returns: number
                           },
"get_listing":
{ Args: { "p_ref": string }; Returns: Json
                           },
"import_units":
{ Args: { "p_commit"?: boolean,"p_property": string,"p_rows": Json }; Returns: Json
                           },
"invitation_preview":
{ Args: { "p_token": string }; Returns: Json
                           },
"invite_member":
{ Args: { "p": Json,"p_org": string }; Returns: Json
                           },
"invite_tenant_access":
{ Args: { "p_email": string,"p_tenant": string }; Returns: Json
                           },
"invite_tenants_access":
{ Args: { "p_tenants": (string)[] }; Returns: Json
                           },
"listing_problem_items":
{ Args: { "p_listing": string }; Returns: Json
                           },
"listing_problems":
{ Args: { "p_listing": string }; Returns: (string)[]
                           },
"log_contact":
{ Args: { "p_channel": string,"p_ref": string }; Returns: undefined
                           },
"log_export":
{ Args: { "p_kind": string,"p_org": string,"p_period": string,"p_property": string }; Returns: undefined
                           },
"mark_conversation_read":
{ Args: { "p_conversation": string }; Returns: undefined
                           },
"my_conversations":
{ Args: { "p_org"?: string }; Returns: {
              "advertiser_role": string,"area": string,"assigned_membership_id": string,"follow_up": string,"id": string,"last_message": string,"last_message_at": string,"last_side": string,"listing_ref": string,"listing_status": string,"listing_title": string,"needs_reply": boolean,"org_name": string,"property_id": string,"tenant_name": string,"unit_label": string,"unread": number
            }[]
                           },
"my_payment_reports":
{ Args: { "p_tenancy": string }; Returns: {
              "amount": number,"answered_at": string,"created_at": string,"id": string,"method": string,"note": string,"paid_on": string,"payment_state": string,"reference": string,"reply": string,"status": string
            }[]
                           },
"my_rent_work":
{ Args: { "p_org": string }; Returns: {
              "amount": number,"decision_reason": string,"entry_id": string,"grp": string,"paid_on": string,"property_id": string,"property_name": string,"ref": string,"status": string,"tenancy_id": string,"unit_label": string,"updated_at": string
            }[]
                           },
"my_saved_listings":
{ Args: Record<PropertyKey, never>; Returns: {
              "area": string,"let_on": string,"listing_id": string,"note": string,"ref": string,"saved_at": string,"status": string,"title": string
            }[]
                           },
"my_tenancies":
{ Args: Record<PropertyKey, never>; Returns: {
              "area": string,"balance": number,"current_rent": number,"due_day": number,"end_date": string,"org_name": string,"property_name": string,"start_date": string,"status": string,"tenancy_id": string,"unit_label": string
            }[]
                           },
"my_viewings":
{ Args: Record<PropertyKey, never>; Returns: {
              "area": string,"cancel_reason": string,"confirmed_start": string,"conversation_id": string,"decline_reason": string,"id": string,"let_on": string,"listing_ref": string,"listing_status": string,"listing_title": string,"meeting_instructions": string,"org_name": string,"proposed_start": string,"requested_start": string,"state": string,"status": string
            }[]
                           },
"my_workspaces":
{ Args: Record<PropertyKey, never>; Returns: {
              "all_properties": boolean,"can_confirm": boolean,"can_correct": boolean,"can_enter_payments": boolean,"can_export": boolean,"can_manage_listings": boolean,"can_manage_tenancies": boolean,"can_view_attachments": boolean,"kind": string,"org_id": string,"org_name": string,"property_ids": (string)[],"role": string
            }[]
                           },
"owing_tenancies":
{ Args: { "p_limit"?: number,"p_org": string,"p_property"?: string }; Returns: {
              "last_contact_at": string,"last_contact_kind": string,"last_reminder_at": string,"next_follow_up": string,"oldest_due": string,"open_follow_ups": number,"owed": number,"pending_amount": number,"property_id": string,"property_name": string,"tenancy_id": string,"tenancy_status": string,"tenant_name": string,"unit_id": string,"unit_label": string
            }[]
                           },
"payments_by_date":
{ Args: { "p_month": string,"p_org": string,"p_property": string }; Returns: {
              "amount": number,"confirmed_at": string,"confirmed_by": string,"entry_id": string,"method": string,"paid_on": string,"property_id": string,"recorded_at": string,"recorded_by": string,"ref": string,"reference": string,"tenant_name": string,"unit_label": string
            }[]
                           },
"portfolio_position":
{ Args: { "p_org": string,"p_period": string }; Returns: {
              "billed": number,"collection_rate": number,"last_confirmed_at": string,"lettable": number,"occupied": number,"outstanding": number,"overdue": number,"owed_now": number,"owing_tenancies": number,"pending_count": number,"property_id": string,"property_name": string,"settled": number,"unavailable": number,"units_total": number
            }[]
                           },
"possible_duplicates":
{ Args: { "p_amount": number,"p_exclude"?: string,"p_paid_on": string,"p_reference": string,"p_tenancy": string }; Returns: {
              "amount": number,"id": string,"paid_on": string,"reason": string,"ref": string,"reference": string,"status": string
            }[]
                           },
"preview_rent_charges":
{ Args: { "p_period": string,"p_property": string }; Returns: {
              "already_exists": boolean,"amount": number,"due_date": string,"tenancy_id": string,"tenant_name": string,"unit_id": string,"unit_label": string
            }[]
                           },
"property_tenants":
{ Args: { "p_property": string }; Returns: {
              "access": string,"balance": number,"email": string,"end_date": string,"last_message_at": string,"last_message_kind": string,"phone": string,"start_date": string,"status": string,"tenancy_id": string,"tenant_id": string,"tenant_name": string,"unit_id": string,"unit_label": string
            }[]
                           },
"record_saved_search_alert":
{ Args: { "p_homes": Json,"p_search": string,"p_through": string }; Returns: undefined
                           },
"records_changed_at":
{ Args: { "p_org": string,"p_property"?: string }; Returns: string
                           },
"register_attachment":
{ Args: { "p": Json }; Returns: string
                           },
"register_support_file":
{ Args: { "p_mime": string,"p_name": string,"p_path": string,"p_size": number,"p_ticket": string }; Returns: string
                           },
"remove_attachment":
{ Args: { "p_attachment": string }; Returns: undefined
                           },
"rent_register":
{ Args: { "p_cutoff"?: string,"p_period": string,"p_property": string }; Returns: {
              "billed": number,"charge_ids": (string)[],"confirmed": number,"credit": number,"due_date": string,"last_confirmed_at": string,"last_confirmed_by": string,"layout": string,"occupancy": string,"outstanding": number,"overdue": boolean,"pending_amount": number,"pending_by": string,"pending_count": number,"rent_status": string,"tenancy_id": string,"tenancy_status": string,"tenant_name": string,"unit_id": string,"unit_label": string
            }[]
                           },
"rent_summary":
{ Args: { "p_cutoff"?: string,"p_org": string,"p_period": string,"p_property": string }; Returns: {
              "billed": number,"collection_rate": number,"computed_at": string,"lettable": number,"occupied": number,"outstanding": number,"overdue": number,"pending_amount": number,"pending_count": number,"settled": number,"unavailable": number,"units_total": number
            }[]
                           },
"rent_trend":
{ Args: { "p_last_period": string,"p_months"?: number,"p_org": string,"p_property": string }; Returns: {
              "billed": number,"collection_rate": number,"period_start": string,"settled": number
            }[]
                           },
"reply_support_ticket":
{ Args: { "p_body": string,"p_ticket": string }; Returns: undefined
                           },
"report_listing":
{ Args: { "p_details": string,"p_reason": string,"p_ref": string }; Returns: string
                           },
"report_missing_payment":
{ Args: { "p": Json }; Returns: string
                           },
"report_prefinalize":
{ Args: { "p_period": string,"p_property": string }; Returns: Json
                           },
"request_viewing":
{ Args: { "p_client_ref": string,"p_note": string,"p_ref": string,"p_start": string }; Returns: string
                           },
"resend_invitation":
{ Args: { "p_membership": string }; Returns: Json
                           },
"resolve_follow_up":
{ Args: { "p_id": string,"p_resolution": string }; Returns: undefined
                           },
"respond_viewing":
{ Args: { "p_action": string,"p_ignore_conflict"?: boolean,"p_instructions"?: string,"p_reason"?: string,"p_time"?: string,"p_viewing": string }; Returns: Json
                           },
"reverse_entry":
{ Args: { "p_entry": string,"p_reason": string }; Returns: Json
                           },
"revoke_tenant_access":
{ Args: { "p_tenant": string }; Returns: undefined
                           },
"save_payment_entry":
{ Args: { "p": Json }; Returns: Json
                           },
"search_listings":
{ Args: { "params": Json }; Returns: {
              "advertiser_role": string,"approx_lat": number,"approx_lng": number,"area": string,"availability_confirmed_at": string,"available_from": string,"bedrooms": number,"building_style": string,"charges": Json,"cover_path": string,"distance_km": number,"facts": Json,"fixed_monthly_total": number,"floor_level": number,"furnishing": string,"layout": string,"move_in_total": number,"photo_count": number,"price_basis": string,"price_period": string,"published_at": string,"ref": string,"rent_amount": number,"rental_scope": string,"road": string,"sponsored": boolean,"title": string,"total_count": number,"totals_complete": boolean,"town": string,"unconfirmed_match": boolean
            }[]
                           },
"send_message":
{ Args: { "p_body": string,"p_client_ref": string,"p_conversation": string }; Returns: string
                           },
"send_tenant_messages":
{ Args: { "p": Json }; Returns: Json
                           },
"set_conversation_follow_up":
{ Args: { "p_assign_membership"?: string,"p_conversation": string,"p_stage"?: string,"p_unassign"?: boolean }; Returns: undefined
                           },
"set_listing_status":
{ Args: { "p_action": string,"p_date"?: string,"p_listing": string }; Returns: undefined
                           },
"set_member_status":
{ Args: { "p_membership": string,"p_reassign_to"?: string,"p_status": string }; Returns: Json
                           },
"staff_activity":
{ Args: { "p_month": string,"p_org": string,"p_property": string }; Returns: {
              "actor_id": string,"actor_name": string,"confirmed": number,"created": number,"not_accepted": number,"returned": number,"reversed": number,"submitted": number
            }[]
                           },
"start_conversation":
{ Args: { "p_body": string,"p_client_ref": string,"p_ref": string }; Returns: string
                           },
"start_listing":
{ Args: { "p": Json }; Returns: string
                           },
"submit_listing":
{ Args: { "p_listing": string }; Returns: undefined
                           },
"team_overview":
{ Args: { "p_org": string }; Returns: {
              "all_properties": boolean,"can_confirm": boolean,"can_correct": boolean,"can_enter_payments": boolean,"can_export": boolean,"can_manage_listings": boolean,"can_manage_tenancies": boolean,"can_view_attachments": boolean,"display_name": string,"email": string,"invite_expires_at": string,"last_active_at": string,"last_sign_in_at": string,"membership_id": string,"open_work": number,"property_ids": (string)[],"property_names": (string)[],"role": string,"status": string,"status_changed_at": string,"submitted_pending": number,"user_id": string
            }[]
                           },
"tenancy_statement":
{ Args: { "p_tenancy": string }; Returns: {
              "balance": number,"charge": number,"description": string,"kind": string,"line_date": string,"payment": number,"ref": string
            }[]
                           },
"tenant_access_preview":
{ Args: { "p_token": string }; Returns: Json
                           },
"tenant_viewing_action":
{ Args: { "p_action": string,"p_reason"?: string,"p_time"?: string,"p_viewing": string }; Returns: undefined
                           },
"touch_activity":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"update_member_access":
{ Args: { "p": Json,"p_membership": string }; Returns: undefined
                           },
"update_tenant_contact":
{ Args: { "p_email": string,"p_phone": string,"p_tenant": string }; Returns: undefined
                           },
"viewing_location":
{ Args: { "p_viewing": string }; Returns: {
              "address": string,"confirmed_start": string,"landmark": string,"latitude": number,"longitude": number,"meeting_instructions": string,"property_name": string
            }[]
                           },
"withdraw_payment_report":
{ Args: { "p_id": string }; Returns: undefined
                           },
"workspace_search":
{ Args: { "p_org": string,"p_q": string }; Returns: {
              "detail": string,"entry_id": string,"kind": string,"property_id": string,"title": string,"unit_id": string
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
