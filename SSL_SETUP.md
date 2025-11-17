# SSL Certificate Setup for TenderAI BF

## Current Setup

✅ **SSL certificates are already configured on the production server:**
- Certificate: `/etc/letsencrypt/live/tender-ai.yulcom.net/fullchain.pem`
- Private Key: `/etc/letsencrypt/live/tender-ai.yulcom.net/privkey.pem`

These certificates are mounted directly into the Nginx container via `docker-compose.override.prod.yml`.

---

## Certificate Auto-Renewal

Let's Encrypt certificates expire after 90 days. Ensure auto-renewal is configured on the server:

### Check if certbot renewal is configured

```bash
# Check cron jobs
sudo crontab -l | grep certbot

# Or check systemd timer
sudo systemctl list-timers | grep certbot
```

### Manual renewal test

```bash
# Test renewal (dry-run)
sudo certbot renew --dry-run

# Actual renewal
sudo certbot renew

# Reload Nginx to use new certificates
docker-compose exec nginx nginx -s reload
```

### Setup auto-renewal if not configured

```bash
# Create renewal hook to reload Nginx after renewal
sudo mkdir -p /etc/letsencrypt/renewal-hooks/post
sudo tee /etc/letsencrypt/renewal-hooks/post/reload-nginx.sh > /dev/null <<'EOF'
#!/bin/bash
cd /home/yulcom/tenderai/rfp-watch-ai
docker-compose exec nginx nginx -s reload
echo "$(date): Nginx reloaded after SSL renewal" >> /var/log/ssl-renewal.log
EOF

sudo chmod +x /etc/letsencrypt/renewal-hooks/post/reload-nginx.sh

# Test the hook
sudo certbot renew --dry-run
```

---

## Option 2: Using Existing SSL Certificates

If you already have SSL certificates from another provider:

### Step 1: Copy Certificates to Server

```bash
# On your local machine, copy certificates to server
scp fullchain.pem user@tender-ai.yulcom.net:/tmp/
scp privkey.pem user@tender-ai.yulcom.net:/tmp/

# On the server, move to nginx-ssl volume
sudo mkdir -p /var/lib/docker/volumes/rfp-watch-ai_nginx-ssl/_data
sudo mv /tmp/fullchain.pem /var/lib/docker/volumes/rfp-watch-ai_nginx-ssl/_data/
sudo mv /tmp/privkey.pem /var/lib/docker/volumes/rfp-watch-ai_nginx-ssl/_data/
sudo chmod 600 /var/lib/docker/volumes/rfp-watch-ai_nginx-ssl/_data/*.pem
```

### Step 2: Verify Certificate Files

```bash
# Check certificate validity
openssl x509 -in /var/lib/docker/volumes/rfp-watch-ai_nginx-ssl/_data/fullchain.pem -noout -text
openssl rsa -in /var/lib/docker/volumes/rfp-watch-ai_nginx-ssl/_data/privkey.pem -check
```

### Step 3: Start Services

```bash
cd /path/to/deployment
docker-compose up -d
```

---

## Option 3: Self-Signed Certificate (Development/Testing Only)

**WARNING**: Self-signed certificates will show browser warnings and should NOT be used in production.

```bash
# Generate self-signed certificate
docker run -it --rm \
  -v /var/lib/docker/volumes/rfp-watch-ai_nginx-ssl/_data:/certs \
  alpine/openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /certs/privkey.pem \
  -out /certs/fullchain.pem \
  -subj "/C=BF/ST=Centre/L=Ouagadougou/O=YulCom/CN=tender-ai.yulcom.net"

# Start services
cd /path/to/deployment
docker-compose up -d
```

---

## Troubleshooting

### Issue: Nginx fails to start

**Check certificate permissions:**
```bash
sudo ls -la /var/lib/docker/volumes/rfp-watch-ai_nginx-ssl/_data/
# Should show readable files
```

**Check Nginx logs:**
```bash
docker-compose logs nginx
```

**Common errors:**
- `cannot load certificate`: Certificate file not found or wrong path
- `PEM_read_bio`: Certificate file corrupted or wrong format
- `permission denied`: Certificate files not readable by Nginx user

### Issue: Let's Encrypt validation fails

**Check DNS:**
```bash
dig tender-ai.yulcom.net
# Should point to your server IP
```

**Check port 80 accessibility:**
```bash
# From external machine
curl -I http://tender-ai.yulcom.net
```

**Check firewall:**
```bash
sudo ufw status
# Ports 80 and 443 should be allowed
```

### Issue: Certificate expired

**Manual renewal:**
```bash
cd /path/to/deployment
./renew-ssl.sh
```

**Check expiry date:**
```bash
echo | openssl s_client -connect tender-ai.yulcom.net:443 2>/dev/null | openssl x509 -noout -dates
```

---

## Security Best Practices

1. **Never commit certificates to Git**
   - Certificates are in Docker volumes, not in repository
   - `.gitignore` should exclude any certificate files

2. **Restrict certificate file permissions**
   ```bash
   sudo chmod 600 /var/lib/docker/volumes/rfp-watch-ai_nginx-ssl/_data/*.pem
   ```

3. **Monitor certificate expiration**
   - Set up monitoring alerts 30 days before expiry
   - Test renewal process regularly

4. **Use strong SSL configuration**
   - TLS 1.2 and 1.3 only (already configured)
   - Strong cipher suites (already configured)
   - HSTS enabled (already configured)

5. **Regular security audits**
   ```bash
   # Test SSL configuration
   docker run --rm -it nmap/nmap --script ssl-enum-ciphers -p 443 tender-ai.yulcom.net
   ```

---

## Integration with CI/CD

The CI/CD workflow does NOT manage SSL certificates automatically. This is by design for security reasons.

**After initial deployment:**
1. SSH into production server
2. Follow SSL setup steps above (once)
3. Certificates persist in Docker volumes across deployments
4. Renewals are handled by cron job on the server

**Certificate locations:**
- Docker volume: `rfp-watch-ai_nginx-ssl`
- Physical location: `/var/lib/docker/volumes/rfp-watch-ai_nginx-ssl/_data/`
- Nginx sees them at: `/etc/nginx/ssl/`

---

## Quick Start Checklist

- [ ] Domain DNS configured (tender-ai.yulcom.net → server IP)
- [ ] Ports 80/443 open in firewall
- [ ] Deploy application with CI/CD
- [ ] Run Certbot standalone to get initial certificates
- [ ] Copy certificates to nginx-ssl volume
- [ ] Restart Nginx service
- [ ] Test HTTPS access: `curl https://tender-ai.yulcom.net/health`
- [ ] Set up auto-renewal cron job
- [ ] Add monitoring for certificate expiration

---

## Resources

- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Certbot Documentation](https://certbot.eff.org/docs/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [SSL Labs Test](https://www.ssllabs.com/ssltest/)
