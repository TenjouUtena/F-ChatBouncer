using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace FChatBouncer.Server.Migrations
{
    /// <inheritdoc />
    public partial class UnifiedCharacterModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CharacterChannels_AspNetUsers_UserId",
                table: "CharacterChannels");

            migrationBuilder.DropForeignKey(
                name: "FK_CharacterChannels_CharacterConnections_UserId_CharacterName",
                table: "CharacterChannels");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_CharacterConnections_UserId_CharacterName",
                table: "CharacterConnections");

            migrationBuilder.DropIndex(
                name: "IX_CharacterConnections_User_Character_Unique",
                table: "CharacterConnections");

            migrationBuilder.DropIndex(
                name: "IX_CharacterChannels_User_Character_Channel_Unique",
                table: "CharacterChannels");

            migrationBuilder.AddColumn<int>(
                name: "CharacterId",
                table: "CharacterConnections",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BouncerUserId",
                table: "CharacterChannels",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CharacterConnectionId",
                table: "CharacterChannels",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "CharacterId",
                table: "CharacterChannels",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Characters",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    StatusMessage = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Gender = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    LastSeen = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    FirstSeen = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastUpdated = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ProfileData = table.Column<string>(type: "text", nullable: true),
                    StructuredProfileData = table.Column<string>(type: "text", nullable: true),
                    RawProData = table.Column<string>(type: "text", nullable: true),
                    IsOnline = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Characters", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CharacterConnections_CharacterId",
                table: "CharacterConnections",
                column: "CharacterId");

            migrationBuilder.CreateIndex(
                name: "IX_CharacterConnections_IsActive",
                table: "CharacterConnections",
                column: "IsActive");

            migrationBuilder.CreateIndex(
                name: "IX_CharacterConnections_IsConnected",
                table: "CharacterConnections",
                column: "IsConnected");

            migrationBuilder.CreateIndex(
                name: "IX_CharacterConnections_User_Character_Unique",
                table: "CharacterConnections",
                columns: new[] { "UserId", "CharacterId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CharacterChannels_BouncerUserId",
                table: "CharacterChannels",
                column: "BouncerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CharacterChannels_CharacterId",
                table: "CharacterChannels",
                column: "CharacterId");

            migrationBuilder.CreateIndex(
                name: "IX_CharacterChannels_Connection_Channel_Unique",
                table: "CharacterChannels",
                columns: new[] { "CharacterConnectionId", "ChannelId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Characters_IsOnline",
                table: "Characters",
                column: "IsOnline");

            migrationBuilder.CreateIndex(
                name: "IX_Characters_Name_Unique",
                table: "Characters",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Characters_Status",
                table: "Characters",
                column: "Status");

            // Data migration: Populate Characters table from existing CharacterConnections data
            migrationBuilder.Sql(@"
                INSERT INTO ""Characters"" (""Name"", ""Status"", ""StatusMessage"", ""Gender"", ""LastSeen"", ""FirstSeen"", ""LastUpdated"", ""IsOnline"")
                SELECT DISTINCT 
                    ""CharacterName"",
                    'offline' as ""Status"",
                    NULL as ""StatusMessage"",
                    'None' as ""Gender"",
                    NOW() as ""LastSeen"",
                    NOW() as ""FirstSeen"",
                    NOW() as ""LastUpdated"",
                    false as ""IsOnline""
                FROM ""CharacterConnections""
                WHERE ""CharacterName"" IS NOT NULL AND ""CharacterName"" != ''
            ");

            // Data migration: Update CharacterConnections to reference the new Characters
            migrationBuilder.Sql(@"
                UPDATE ""CharacterConnections""
                SET ""CharacterId"" = c.""Id""
                FROM ""Characters"" c
                WHERE ""CharacterConnections"".""CharacterName"" = c.""Name""
            ");

            // Make CharacterId non-nullable
            migrationBuilder.AlterColumn<int>(
                name: "CharacterId",
                table: "CharacterConnections",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            // Now drop the old columns
            migrationBuilder.DropColumn(
                name: "CharacterName",
                table: "CharacterConnections");

            migrationBuilder.DropColumn(
                name: "CharacterName",
                table: "CharacterChannels");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "CharacterChannels");

            migrationBuilder.AddForeignKey(
                name: "FK_CharacterChannels_AspNetUsers_BouncerUserId",
                table: "CharacterChannels",
                column: "BouncerUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_CharacterChannels_CharacterConnections_CharacterConnectionId",
                table: "CharacterChannels",
                column: "CharacterConnectionId",
                principalTable: "CharacterConnections",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_CharacterChannels_Characters_CharacterId",
                table: "CharacterChannels",
                column: "CharacterId",
                principalTable: "Characters",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_CharacterConnections_Characters_CharacterId",
                table: "CharacterConnections",
                column: "CharacterId",
                principalTable: "Characters",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CharacterChannels_AspNetUsers_BouncerUserId",
                table: "CharacterChannels");

            migrationBuilder.DropForeignKey(
                name: "FK_CharacterChannels_CharacterConnections_CharacterConnectionId",
                table: "CharacterChannels");

            migrationBuilder.DropForeignKey(
                name: "FK_CharacterChannels_Characters_CharacterId",
                table: "CharacterChannels");

            migrationBuilder.DropForeignKey(
                name: "FK_CharacterConnections_Characters_CharacterId",
                table: "CharacterConnections");

            migrationBuilder.DropTable(
                name: "Characters");

            migrationBuilder.DropIndex(
                name: "IX_CharacterConnections_CharacterId",
                table: "CharacterConnections");

            migrationBuilder.DropIndex(
                name: "IX_CharacterConnections_IsActive",
                table: "CharacterConnections");

            migrationBuilder.DropIndex(
                name: "IX_CharacterConnections_IsConnected",
                table: "CharacterConnections");

            migrationBuilder.DropIndex(
                name: "IX_CharacterConnections_User_Character_Unique",
                table: "CharacterConnections");

            migrationBuilder.DropIndex(
                name: "IX_CharacterChannels_BouncerUserId",
                table: "CharacterChannels");

            migrationBuilder.DropIndex(
                name: "IX_CharacterChannels_CharacterId",
                table: "CharacterChannels");

            migrationBuilder.DropIndex(
                name: "IX_CharacterChannels_Connection_Channel_Unique",
                table: "CharacterChannels");

            migrationBuilder.DropColumn(
                name: "CharacterId",
                table: "CharacterConnections");

            migrationBuilder.DropColumn(
                name: "BouncerUserId",
                table: "CharacterChannels");

            migrationBuilder.DropColumn(
                name: "CharacterConnectionId",
                table: "CharacterChannels");

            migrationBuilder.DropColumn(
                name: "CharacterId",
                table: "CharacterChannels");

            migrationBuilder.AddColumn<string>(
                name: "CharacterName",
                table: "CharacterConnections",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CharacterName",
                table: "CharacterChannels",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "UserId",
                table: "CharacterChannels",
                type: "character varying(450)",
                maxLength: 450,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddUniqueConstraint(
                name: "AK_CharacterConnections_UserId_CharacterName",
                table: "CharacterConnections",
                columns: new[] { "UserId", "CharacterName" });

            migrationBuilder.CreateIndex(
                name: "IX_CharacterConnections_User_Character_Unique",
                table: "CharacterConnections",
                columns: new[] { "UserId", "CharacterName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CharacterChannels_User_Character_Channel_Unique",
                table: "CharacterChannels",
                columns: new[] { "UserId", "CharacterName", "ChannelId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_CharacterChannels_AspNetUsers_UserId",
                table: "CharacterChannels",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_CharacterChannels_CharacterConnections_UserId_CharacterName",
                table: "CharacterChannels",
                columns: new[] { "UserId", "CharacterName" },
                principalTable: "CharacterConnections",
                principalColumns: new[] { "UserId", "CharacterName" },
                onDelete: ReferentialAction.Cascade);
        }
    }
}
