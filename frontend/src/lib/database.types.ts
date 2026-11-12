export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: string;
          metadata: NonNullable<Json>;
          target_id: string | null;
          target_type: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          target_id?: string | null;
          target_type: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          target_id?: string | null;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      generated_models: {
        Row: {
          created_at: string;
          duration_ms: number | null;
          engine_info: NonNullable<Json>;
          face_count: number | null;
          glb_key: string;
          id: string;
          job_id: string;
          product_id: string;
          quality_notes: NonNullable<Json>;
          quality_status: Database['public']['Enums']['quality_status'];
          status: Database['public']['Enums']['model_status'];
          texture_mode: Database['public']['Enums']['texture_mode'];
          usdz_key: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          duration_ms?: number | null;
          engine_info?: NonNullable<Json>;
          face_count?: number | null;
          glb_key: string;
          id?: string;
          job_id: string;
          product_id: string;
          quality_notes?: NonNullable<Json>;
          quality_status: Database['public']['Enums']['quality_status'];
          status?: Database['public']['Enums']['model_status'];
          texture_mode: Database['public']['Enums']['texture_mode'];
          usdz_key?: string | null;
        };
        Update: {
          created_at?: string;
          duration_ms?: number | null;
          engine_info?: NonNullable<Json>;
          face_count?: number | null;
          glb_key?: string;
          id?: string;
          job_id?: string;
          product_id?: string;
          quality_notes?: NonNullable<Json>;
          quality_status?: Database['public']['Enums']['quality_status'];
          status?: Database['public']['Enums']['model_status'];
          texture_mode?: Database['public']['Enums']['texture_mode'];
          usdz_key?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'generated_models_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: true;
            referencedRelation: 'generation_jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'generated_models_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: true;
            referencedRelation: 'submission_history';
            referencedColumns: ['job_id'];
          },
          {
            foreignKeyName: 'generated_models_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'generated_models_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'submission_history';
            referencedColumns: ['id'];
          },
        ];
      };
      generation_jobs: {
        Row: {
          attempt_count: number;
          completed_at: string | null;
          created_at: string;
          current_stage: Database['public']['Enums']['job_stage'] | null;
          error_code: string | null;
          error_message: string | null;
          id: string;
          product_id: string;
          started_at: string | null;
          status: Database['public']['Enums']['job_status'];
          user_id: string;
          validation_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempt_count?: number;
          completed_at?: string | null;
          created_at?: string;
          current_stage?: Database['public']['Enums']['job_stage'] | null;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          product_id: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['job_status'];
          user_id: string;
          validation_id: string;
        };
        Update: {
          attempt_count?: number;
          completed_at?: string | null;
          created_at?: string;
          current_stage?: Database['public']['Enums']['job_stage'] | null;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          product_id?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['job_status'];
          user_id?: string;
          validation_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'generation_jobs_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'generation_jobs_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'submission_history';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'generation_jobs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'generation_jobs_validation_id_fkey';
            columns: ['validation_id'];
            isOneToOne: false;
            referencedRelation: 'image_validations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'generation_jobs_validation_id_fkey';
            columns: ['validation_id'];
            isOneToOne: false;
            referencedRelation: 'submission_history';
            referencedColumns: ['validation_id'];
          },
        ];
      };
      image_validations: {
        Row: {
          category_confidence: number | null;
          config_version: string;
          contains_human: boolean | null;
          contains_other_objects: boolean | null;
          detected_category: string | null;
          id: string;
          is_valid: boolean;
          object_count: number | null;
          product_id: string;
          quality_score: number | null;
          rejection_reasons: NonNullable<Json>;
          sub_scores: NonNullable<Json>;
          user_id: string;
          validated_at: string;
        };
        ComputedFields: never;
        Insert: {
          category_confidence?: number | null;
          config_version: string;
          contains_human?: boolean | null;
          contains_other_objects?: boolean | null;
          detected_category?: string | null;
          id?: string;
          is_valid: boolean;
          object_count?: number | null;
          product_id: string;
          quality_score?: number | null;
          rejection_reasons?: NonNullable<Json>;
          sub_scores?: NonNullable<Json>;
          user_id: string;
          validated_at?: string;
        };
        Update: {
          category_confidence?: number | null;
          config_version?: string;
          contains_human?: boolean | null;
          contains_other_objects?: boolean | null;
          detected_category?: string | null;
          id?: string;
          is_valid?: boolean;
          object_count?: number | null;
          product_id?: string;
          quality_score?: number | null;
          rejection_reasons?: NonNullable<Json>;
          sub_scores?: NonNullable<Json>;
          user_id?: string;
          validated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'image_validations_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'image_validations_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'submission_history';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'image_validations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      products: {
        Row: {
          canonical_url: string | null;
          category: string | null;
          created_at: string;
          id: string;
          is_public: boolean;
          marketplace: Database['public']['Enums']['marketplace'];
          name: string | null;
          original_image_key: string | null;
          original_product_url: string | null;
          price_currency: string | null;
          price_retrieved_at: string | null;
          retain_until: string;
          rights_confirmed: boolean;
          share_token: string | null;
          source_price: number | null;
          user_id: string;
          user_size_cm: Json | null;
        };
        ComputedFields: never;
        Insert: {
          canonical_url?: string | null;
          category?: string | null;
          created_at?: string;
          id?: string;
          is_public?: boolean;
          marketplace?: Database['public']['Enums']['marketplace'];
          name?: string | null;
          original_image_key?: string | null;
          original_product_url?: string | null;
          price_currency?: string | null;
          price_retrieved_at?: string | null;
          retain_until?: string;
          rights_confirmed: boolean;
          share_token?: string | null;
          source_price?: number | null;
          user_id: string;
          user_size_cm?: Json | null;
        };
        Update: {
          canonical_url?: string | null;
          category?: string | null;
          created_at?: string;
          id?: string;
          is_public?: boolean;
          marketplace?: Database['public']['Enums']['marketplace'];
          name?: string | null;
          original_image_key?: string | null;
          original_product_url?: string | null;
          price_currency?: string | null;
          price_retrieved_at?: string | null;
          retain_until?: string;
          rights_confirmed?: boolean;
          share_token?: string | null;
          source_price?: number | null;
          user_id?: string;
          user_size_cm?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'products_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          consented_at: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          is_active: boolean;
          role: Database['public']['Enums']['app_role'];
        };
        ComputedFields: never;
        Insert: {
          consented_at?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          is_active?: boolean;
          role?: Database['public']['Enums']['app_role'];
        };
        Update: {
          consented_at?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          is_active?: boolean;
          role?: Database['public']['Enums']['app_role'];
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          bucket: string;
          hits: number;
          subject: string;
          window_start: string;
        };
        ComputedFields: never;
        Insert: {
          bucket: string;
          hits?: number;
          subject: string;
          window_start: string;
        };
        Update: {
          bucket?: string;
          hits?: number;
          subject?: string;
          window_start?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      submission_history: {
        Row: {
          category: string | null;
          created_at: string;
          detected_category: string | null;
          id: string;
          is_public: boolean;
          is_valid: boolean | null;
          job_id: string | null;
          job_stage: Database['public']['Enums']['job_stage'] | null;
          job_status: Database['public']['Enums']['job_status'] | null;
          marketplace: Database['public']['Enums']['marketplace'];
          model_id: string | null;
          name: string | null;
          original_image_key: string | null;
          original_product_url: string | null;
          quality_score: number | null;
          quality_status: Database['public']['Enums']['quality_status'] | null;
          rejection_reasons: Json | null;
          status: string | null;
          user_id: string;
          validation_id: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'products_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      is_active_user: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      rate_limit_hit: {
        Args: {
          p_bucket: string;
          p_max: number;
          p_subject: string;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: 'user' | 'admin';
      job_stage:
        | 'validating_image'
        | 'preparing_image'
        | 'generating_geometry'
        | 'processing_texture'
        | 'validating_model'
        | 'preparing_ar_asset';
      job_status: 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled';
      marketplace: 'none' | 'shopee' | 'tokopedia';
      model_status: 'ready' | 'disabled';
      quality_status: 'good' | 'fair' | 'poor';
      texture_mode: 'baked' | 'vertex_color';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ['user', 'admin'],
      job_stage: [
        'validating_image',
        'preparing_image',
        'generating_geometry',
        'processing_texture',
        'validating_model',
        'preparing_ar_asset',
      ],
      job_status: ['queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled'],
      marketplace: ['none', 'shopee', 'tokopedia'],
      model_status: ['ready', 'disabled'],
      quality_status: ['good', 'fair', 'poor'],
      texture_mode: ['baked', 'vertex_color'],
    },
  },
} as const;
