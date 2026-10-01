package com.example.schedule.service;

import com.example.schedule.common.Biz;
import com.example.schedule.mapper.AvatarMapper;
import com.example.schedule.mapper.SysUserMapper;
import com.example.schedule.model.SysUser;
import com.example.schedule.model.UserAvatar;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.IIOException;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 用户头像。上传的图片:
 * <ul>
 *   <li>按文件头判断真实格式(只认 PNG、JPG、GIF),不信任扩展名和 Content-Type</li>
 *   <li>解码前先读尺寸,超过 4096×4096 直接拒绝,防止用小文件撑爆内存</li>
 *   <li>居中裁成正方形、缩成 256×256 后重新编码为 PNG 保存:去掉照片里的位置等元数据,
 *       也去掉混在图片文件里的其他内容。原图不保存</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class AvatarService {

    private static final Logger log = LoggerFactory.getLogger(AvatarService.class);

    public static final long MAX_BYTES = 2L * 1024 * 1024;
    private static final int MAX_DIMENSION = 4096;
    private static final int SIZE = 256;

    private final AvatarMapper avatarMapper;
    private final SysUserMapper userMapper;

    /** 上传或替换自己的头像,返回新的版本号 */
    public long upload(SysUser me, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw Biz.bad("请选择一张图片");
        }
        if (file.getSize() > MAX_BYTES) {
            throw Biz.bad("图片不能超过 2MB");
        }
        byte[] png;
        try {
            png = toAvatarPng(file.getBytes());
        } catch (IOException e) {
            throw Biz.bad("图片读取失败,请换一张试试");
        }
        avatarMapper.upsert(me.getUserId(), png);
        log.info("{} 更新了头像({} 字节)", me.getUsername(), png.length);
        return version(avatarMapper.find(me.getUserId()).getUpdatedAt());
    }

    public void remove(SysUser me) {
        avatarMapper.delete(me.getUserId());
        log.info("{} 移除了头像", me.getUsername());
    }

    /** 管理员移除别人的头像(比如头像不合适) */
    public void removeByAdmin(SysUser admin, long userId) {
        SysUser u = userMapper.findById(userId);
        if (u == null) {
            throw Biz.notFound("用户不存在");
        }
        if (avatarMapper.delete(userId) == 0) {
            throw Biz.bad("该用户没有设置头像");
        }
        log.info("管理员 {} 移除了 {} 的头像", admin.getUsername(), u.getUsername());
    }

    /** 没有头像时返回 null */
    public UserAvatar find(long userId) {
        return avatarMapper.find(userId);
    }

    /** 有头像的用户 → 版本号 */
    public Map<Long, Long> versions() {
        Map<Long, Long> m = new LinkedHashMap<>();
        for (UserAvatar a : avatarMapper.findVersions()) {
            m.put(a.getUserId(), version(a.getUpdatedAt()));
        }
        return m;
    }

    public static long version(LocalDateTime updatedAt) {
        return updatedAt.atZone(ZoneId.systemDefault()).toEpochSecond();
    }

    /** 校验并转成 256×256 PNG */
    static byte[] toAvatarPng(byte[] data) throws IOException {
        String format = sniff(data);
        if (format == null) {
            throw Biz.bad("只支持 PNG、JPG、GIF 格式的图片");
        }
        BufferedImage src;
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
            Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(format);
            if (in == null || !readers.hasNext()) {
                throw Biz.bad("只支持 PNG、JPG、GIF 格式的图片");
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                int w = reader.getWidth(0), h = reader.getHeight(0);
                if (w <= 0 || h <= 0 || w > MAX_DIMENSION || h > MAX_DIMENSION) {
                    throw Biz.bad("图片尺寸不能超过 " + MAX_DIMENSION + "×" + MAX_DIMENSION);
                }
                src = reader.read(0);
            } catch (IIOException e) {
                // 例如 CMYK 色彩的 JPG,或者文件已损坏
                throw Biz.bad("这张图片无法识别,请换一张(或另存为普通的 PNG / JPG 再上传)");
            } finally {
                reader.dispose();
            }
        }
        // 居中裁成正方形
        int side = Math.min(src.getWidth(), src.getHeight());
        BufferedImage img = src.getSubimage((src.getWidth() - side) / 2, (src.getHeight() - side) / 2, side, side);
        // 大图分几次缩小,比一次缩到 256 更清晰
        while (side / 2 >= SIZE) {
            side /= 2;
            img = scale(img, side);
        }
        img = scale(img, SIZE);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    private static BufferedImage scale(BufferedImage src, int size) {
        BufferedImage dst = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = dst.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.drawImage(src, 0, 0, size, size, null);
        } finally {
            g.dispose();
        }
        return dst;
    }

    /** 按文件头识别格式 */
    private static String sniff(byte[] d) {
        if (d.length >= 8 && (d[0] & 0xFF) == 0x89 && d[1] == 'P' && d[2] == 'N' && d[3] == 'G') {
            return "png";
        }
        if (d.length >= 3 && (d[0] & 0xFF) == 0xFF && (d[1] & 0xFF) == 0xD8 && (d[2] & 0xFF) == 0xFF) {
            return "jpeg";
        }
        if (d.length >= 6 && d[0] == 'G' && d[1] == 'I' && d[2] == 'F' && d[3] == '8' && (d[4] == '7' || d[4] == '9') && d[5] == 'a') {
            return "gif";
        }
        return null;
    }
}
