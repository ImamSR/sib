use anchor_lang::prelude::*;

declare_id!("HqJ3a7UwwxjorwDJUYMAWBC8Q4fRzqF47Pgq5fjr3D1F");

#[program]
pub mod sib {
    use super::*;

    /// Create a new certificate (Ijazah).
    /// - management = uploader wallet (Signer)
    /// - operator_pubkey = same as uploader
    /// - operator_name = human-readable
    /// - file_uri + file_hash (SHA-256) for the document
    pub fn add_certificate(
        ctx: Context<AddCertificate>,
        program_studi: String,
        universitas: String,
        kode_batch: String,
        nim: String,
        nama: String,
        nomor_ijazah: String,
        operator_name: String,
        file_uri: String,
        file_hash: [u8; 32],
    ) -> Result<()> {
        // Length caps must match allocated space
        require!(program_studi.len() <= Certificate::FIELD_64, SibError::StringTooLong);
        require!(universitas.len()   <= Certificate::FIELD_64, SibError::StringTooLong);
        require!(kode_batch.len()    <= Certificate::FIELD_32, SibError::StringTooLong);
        require!(nim.len()           <= Certificate::FIELD_32, SibError::StringTooLong);
        require!(nama.len()          <= Certificate::FIELD_64, SibError::StringTooLong);
        require!(nomor_ijazah.len()  <= Certificate::FIELD_64, SibError::StringTooLong);
        require!(operator_name.len() <= Certificate::FIELD_64, SibError::StringTooLong);
        require!(file_uri.len()      <= Certificate::URI_MAX,  SibError::StringTooLong);

        let cert = &mut ctx.accounts.certificate;

        cert.bump = ctx.bumps.certificate;
        cert.management       = ctx.accounts.operator.key();
        cert.operator_pubkey  = ctx.accounts.operator.key();
        cert.operator_name    = operator_name;

        cert.program_studi    = program_studi;
        cert.universitas      = universitas;
        cert.kode_batch       = kode_batch;
        cert.waktu_masuk      = Clock::get()?.unix_timestamp;
        cert.nim              = nim;
        cert.nama             = nama;
        cert.nomor_ijazah     = nomor_ijazah;

        cert.file_uri         = file_uri;
        cert.file_hash        = file_hash;

        Ok(())
    }

    /// Update/attach file later (only the same uploader wallet).
    pub fn update_file(
        _ctx: Context<UpdateFile>,
        new_uri: String,
        new_hash: [u8; 32],
    ) -> Result<()> {
        require!(new_uri.len() <= Certificate::URI_MAX, SibError::StringTooLong);

        let cert = &mut _ctx.accounts.certificate;
        cert.file_uri = new_uri;
        cert.file_hash = new_hash;
        Ok(())
    }
}

/* ------------------------------- ACCOUNTS ---------------------------------- */

#[derive(Accounts)]
#[instruction(
    program_studi: String,
    universitas: String,
    kode_batch: String,
    nim: String,
    nama: String,
    nomor_ijazah: String,
    operator_name: String,
    file_uri: String
)]
pub struct AddCertificate<'info> {
    #[account(
        init,
        payer = operator,
        space = 8 + Certificate::MAX_SIZE,
        seeds = [b"cert", nomor_ijazah.as_bytes()],
        bump
    )]
    pub certificate: Account<'info, Certificate>,

    #[account(mut)]
    pub operator: Signer<'info>, // uploader = management

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateFile<'info> {
    #[account(
        mut,
        constraint = certificate.management == operator.key() @ SibError::NotAuthorized
    )]
    pub certificate: Account<'info, Certificate>,

    /// The same uploader wallet that created the cert
    pub operator: Signer<'info>,
}

/* --------------------------------- STATE ----------------------------------- */

#[account]
pub struct Certificate {
    pub management: Pubkey,        // uploader wallet
    pub operator_pubkey: Pubkey,   // equals uploader
    pub operator_name: String,     // human-readable

    pub program_studi: String,
    pub universitas: String,
    pub kode_batch: String,
    pub waktu_masuk: i64,
    pub nim: String,
    pub nama: String,
    pub nomor_ijazah: String,

    pub file_uri: String,          // Arweave/HTTP link
    pub file_hash: [u8; 32],       // SHA-256

    pub bump: u8,
}

impl Certificate {
    pub const FIELD_32: usize = 32;
    pub const FIELD_64: usize = 64;
    pub const URI_MAX:  usize = 256;

    pub const MAX_SIZE: usize =
        32 +                            // management
        32 +                            // operator_pubkey
        (4 + Self::FIELD_64) +          // operator_name
        (4 + Self::FIELD_64) +          // program_studi
        (4 + Self::FIELD_64) +          // universitas
        (4 + Self::FIELD_32) +          // kode_batch
        8  +                            // waktu_masuk
        (4 + Self::FIELD_32) +          // nim
        (4 + Self::FIELD_64) +          // nama
        (4 + Self::FIELD_64) +          // nomor_ijazah
        (4 + Self::URI_MAX) +           // file_uri
        32 +                            // file_hash
        1;                              // bump
}

/* --------------------------------- ERRORS ---------------------------------- */

#[error_code]
pub enum SibError {
    #[msg("Provided string exceeds the allowed maximum length for its field.")]
    StringTooLong,
    #[msg("You are not authorized to modify this certificate.")]
    NotAuthorized,
}
