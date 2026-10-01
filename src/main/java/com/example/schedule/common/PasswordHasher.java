package com.example.schedule.common;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * 密码哈希:PBKDF2-HMAC-SHA512,每个密码独立随机盐,迭代 210000 次(OWASP 推荐值)。
 * 存储格式 pbkdf2_sha512$迭代次数$盐(Base64)$哈希(Base64),自带参数,以后调高迭代次数或换算法也能校验旧密码。
 * 只用 JDK 自带实现,不依赖额外的库。
 */
public final class PasswordHasher {

    private static final String PREFIX = "pbkdf2_sha512";
    private static final int ITERATIONS = 210_000;
    private static final int SALT_BYTES = 16;
    private static final int HASH_BITS = 512;
    private static final SecureRandom RANDOM = new SecureRandom();

    /** 用户不存在时也算一次哈希,避免通过响应时间判断用户名是否存在 */
    private static final String DUMMY = hash("dummy-password-for-timing");

    private PasswordHasher() {
    }

    public static String hash(String raw) {
        byte[] salt = new byte[SALT_BYTES];
        RANDOM.nextBytes(salt);
        byte[] h = pbkdf2(raw, salt, ITERATIONS);
        Base64.Encoder b64 = Base64.getEncoder();
        return PREFIX + "$" + ITERATIONS + "$" + b64.encodeToString(salt) + "$" + b64.encodeToString(h);
    }

    /** 常量时间比较;stored 为 null 或格式不对时返回 false(仍然消耗同样的计算时间) */
    public static boolean matches(String raw, String stored) {
        if (raw == null) {
            return false;
        }
        String[] parts = stored == null ? null : stored.split("\\$");
        if (parts == null || parts.length != 4 || !PREFIX.equals(parts[0])) {
            parts = DUMMY.split("\\$");
            pbkdf2(raw, Base64.getDecoder().decode(parts[2]), Integer.parseInt(parts[1]));
            return false;
        }
        try {
            int iterations = Integer.parseInt(parts[1]);
            byte[] salt = Base64.getDecoder().decode(parts[2]);
            byte[] expected = Base64.getDecoder().decode(parts[3]);
            return MessageDigest.isEqual(expected, pbkdf2(raw, salt, iterations));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static byte[] pbkdf2(String raw, byte[] salt, int iterations) {
        PBEKeySpec spec = new PBEKeySpec(raw.toCharArray(), salt, iterations, HASH_BITS);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA512").generateSecret(spec).getEncoded();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("PBKDF2 不可用", e);
        } finally {
            spec.clearPassword();
        }
    }
}
