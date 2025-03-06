-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For better text search capabilities

-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    username TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user'
);

-- Page revisions table (create this first since pages references it)
CREATE TABLE public.page_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID NOT NULL,  -- We'll add the foreign key after pages table is created
    created_by UUID NOT NULL REFERENCES public.users(id),
    edited_by UUID NOT NULL REFERENCES public.users(id),
    content TEXT NOT NULL, -- store raw Markdown
    revision_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    is_approved BOOLEAN DEFAULT FALSE,
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(content, '')), 'B')
    ) STORED,
    labels TEXT[] DEFAULT '{}'  -- new: store proposed labels here
);

-- Pages table
CREATE TABLE public.pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('official', 'unofficial')) DEFAULT 'unofficial',
    is_approved BOOLEAN DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES public.users(id),
    edited_by UUID REFERENCES public.users(id),
    current_revision_id UUID REFERENCES public.page_revisions(id),
    approved_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A')
    ) STORED,
    labels TEXT[] DEFAULT '{}'
);

-- Now add the foreign key to page_revisions
ALTER TABLE public.page_revisions
    ADD CONSTRAINT fk_page_revisions_page_id
    FOREIGN KEY (page_id)
    REFERENCES public.pages(id)
    ON DELETE CASCADE;

-- User scores table
CREATE TABLE public.user_scores (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0 NOT NULL CHECK (score >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Add constraints for revision numbers
ALTER TABLE public.page_revisions 
    ADD CONSTRAINT unique_revision_per_page UNIQUE (page_id, revision_number);

-- Create indexes
CREATE INDEX idx_pages_created_by ON public.pages(created_by);
CREATE INDEX idx_pages_edited_by ON public.pages(edited_by);
CREATE INDEX idx_pages_approved_by ON public.pages(approved_by);
CREATE INDEX idx_page_revisions_page_id ON public.page_revisions(page_id);
CREATE INDEX idx_page_revisions_created_by ON public.page_revisions(created_by);
CREATE INDEX idx_page_revisions_edited_by ON public.page_revisions(edited_by);
CREATE INDEX idx_pages_search ON public.pages USING gin(search_vector);
CREATE INDEX idx_page_revisions_search ON public.page_revisions USING gin(search_vector);
CREATE INDEX idx_pages_is_approved ON public.pages(is_approved);
CREATE INDEX idx_pages_current_revision ON public.pages(current_revision_id);

-- Functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION update_page_edited_by()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.edited_by IS NULL THEN
        NEW.edited_by = NEW.created_by;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION update_current_revision()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_approved = true THEN
        UPDATE public.pages 
        SET current_revision_id = NEW.id
        WHERE id = NEW.page_id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION handle_user_points()
RETURNS TRIGGER AS $$
DECLARE
    user_id_to_update UUID;
    points_to_add INTEGER;
BEGIN
    -- For pages table
    IF TG_TABLE_NAME = 'pages' THEN
        -- Only handle when a page becomes approved
        IF (TG_OP = 'UPDATE' AND OLD.is_approved = false AND NEW.is_approved = true) THEN
            user_id_to_update := NEW.created_by;
            points_to_add := 5; -- 5 points for approved page

            -- Update or insert into user_scores
            INSERT INTO public.user_scores (user_id, score)
            VALUES (user_id_to_update, points_to_add)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                score = user_scores.score + points_to_add,
                updated_at = TIMEZONE('utc'::text, NOW());
        END IF;
    -- For page_revisions table
    ELSIF TG_TABLE_NAME = 'page_revisions' THEN
        -- Only handle when a revision becomes approved
        IF (TG_OP = 'UPDATE' AND OLD.is_approved = false AND NEW.is_approved = true) THEN
            user_id_to_update := NEW.created_by;
            points_to_add := 1; -- 1 point for approved revision

            -- Update or insert into user_scores
            INSERT INTO public.user_scores (user_id, score)
            VALUES (user_id_to_update, points_to_add)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                score = user_scores.score + points_to_add,
                updated_at = TIMEZONE('utc'::text, NOW());
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_pages_updated_at ON public.pages;
DROP TRIGGER IF EXISTS set_page_edited_by ON public.pages;
DROP TRIGGER IF EXISTS update_page_current_revision ON public.page_revisions;
DROP TRIGGER IF EXISTS on_revision_approved ON public.page_revisions;
DROP TRIGGER IF EXISTS on_page_approved ON public.pages;

-- Create triggers
CREATE TRIGGER update_pages_updated_at
    BEFORE UPDATE ON public.pages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_page_edited_by
    BEFORE INSERT ON public.pages
    FOR EACH ROW
    EXECUTE FUNCTION update_page_edited_by();

CREATE TRIGGER update_page_current_revision
    AFTER UPDATE ON public.page_revisions
    FOR EACH ROW
    WHEN (OLD.is_approved = false AND NEW.is_approved = true)
    EXECUTE FUNCTION update_current_revision();

CREATE TRIGGER on_revision_approved
    AFTER UPDATE ON public.page_revisions
    FOR EACH ROW
    EXECUTE FUNCTION handle_user_points();

CREATE TRIGGER on_page_approved
    AFTER UPDATE ON public.pages
    FOR EACH ROW
    EXECUTE FUNCTION handle_user_points();

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_scores ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users are viewable by everyone"
    ON public.users FOR SELECT
    USING (true);

CREATE POLICY "Users can update their own record"
    ON public.users FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Allow authenticated users to create their own record"
    ON public.users FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' 
        AND auth.uid() = id
    );

CREATE POLICY "Pages are viewable by everyone"
    ON public.pages FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can create pages"
    ON public.pages FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update their own unofficial pages"
    ON public.pages FOR UPDATE
    USING (
        auth.uid() = created_by 
        AND status = 'unofficial'
    );

CREATE POLICY "Admins can update or delete any page"
    ON public.pages FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 
            FROM public.users 
            WHERE id = auth.uid() 
              AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 
            FROM public.users 
            WHERE id = auth.uid() 
              AND role = 'admin'
        )
    );

CREATE POLICY "Page revisions are viewable by everyone"
    ON public.page_revisions FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can create revisions"
    ON public.page_revisions FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins can update or delete any page_revisions"
    ON public.page_revisions FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.users
            WHERE id = auth.uid()
              AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.users
            WHERE id = auth.uid()
              AND role = 'admin'
        )
    );

CREATE POLICY "Scores are viewable by everyone"
    ON public.user_scores FOR SELECT
    USING (true);

CREATE POLICY "System only updates scores"
    ON public.user_scores FOR UPDATE
    USING (false);

CREATE POLICY "Admins can update page revisions"
    ON public.page_revisions
    FOR UPDATE
    TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "Admins can delete page revisions"
    ON public.page_revisions
    FOR DELETE 
    TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

------------------------------------------------------------------
-- Added new table for storing memory references for each page
------------------------------------------------------------------
CREATE TABLE public.page_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
    memory_id UUID NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);